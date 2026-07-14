from __future__ import annotations

import importlib.util
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Callable


FRONTEND_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = FRONTEND_ROOT.parent.parent
DEFAULT_SAMPLE_SUBMISSION = WORKSPACE_ROOT / "input" / "simulation" / "sample_submission"
SAMPLE_SUBMISSION = Path(
    os.environ.get(
        "CABT_SAMPLE_SUBMISSION_DIR",
        DEFAULT_SAMPLE_SUBMISSION if DEFAULT_SAMPLE_SUBMISSION.exists() else FRONTEND_ROOT / "sample_submission",
    )
).resolve()
sys.path.insert(0, str(SAMPLE_SUBMISSION))

from cg.api import all_attack, all_card_data  # noqa: E402
from cg.game import battle_finish, battle_select, battle_start  # noqa: E402


AgentFn = Callable[[dict[str, Any]], list[int]]


def to_jsonable(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return {field: to_jsonable(getattr(value, field)) for field in value.__dataclass_fields__}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if hasattr(value, "value"):
        return value.value
    return value


def first_legal_agent(obs: dict[str, Any]) -> list[int]:
    select = obs.get("select")
    if select is None:
        raise RuntimeError("The bridge expected preselected decks before battle start.")
    max_count = int(select.get("maxCount", 0))
    min_count = int(select.get("minCount", 0))
    option_count = len(select.get("option") or [])
    count = min(max(max_count, min_count), option_count)
    return list(range(count))


def validate_action(obs: dict[str, Any], action: Any, actor: str) -> list[int]:
    select = obs.get("select")
    if select is None:
        raise RuntimeError(f"{actor} was asked to act with obs.select=None")
    if not isinstance(action, list):
        raise RuntimeError(f"{actor} returned non-list action: {type(action).__name__}")
    if not all(isinstance(item, int) for item in action):
        raise RuntimeError(f"{actor} returned non-int action items: {action!r}")
    min_count = int(select.get("minCount", 0))
    max_count = int(select.get("maxCount", 0))
    option_count = len(select.get("option") or [])
    if len(action) < min_count or len(action) > max_count:
        raise RuntimeError(
            f"{actor} returned {len(action)} choices, expected {min_count}..{max_count}"
        )
    if len(set(action)) != len(action):
        raise RuntimeError(f"{actor} returned duplicate option indexes: {action!r}")
    out_of_range = [item for item in action if item < 0 or item >= option_count]
    if out_of_range:
        raise RuntimeError(
            f"{actor} returned out-of-range option indexes {out_of_range!r}; "
            f"option_count={option_count}"
        )
    return action


def load_agent(agent_path: str | None) -> AgentFn:
    if not agent_path:
        return first_legal_agent

    raw_path = Path(agent_path)
    if raw_path.is_absolute():
        path = raw_path.resolve()
    else:
        frontend_path = (FRONTEND_ROOT / raw_path).resolve()
        path = frontend_path if frontend_path.exists() else (WORKSPACE_ROOT / raw_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Agent file not found: {path}")

    old_cwd = Path.cwd()
    sys.path.insert(0, str(path.parent))
    try:
        os.chdir(path.parent)
        module_name = f"cabt_agent_{abs(hash(str(path)))}"
        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not import agent: {path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
    finally:
        os.chdir(old_cwd)
        try:
            sys.path.remove(str(path.parent))
        except ValueError:
            pass

    raw_agent = getattr(module, "agent", None)
    if not callable(raw_agent):
        raise AttributeError(f"{path} does not export callable agent(obs)")

    def agent(obs: dict[str, Any]) -> list[int]:
        old_cwd = Path.cwd()
        try:
            os.chdir(path.parent)
            return raw_agent(obs)
        finally:
            os.chdir(old_cwd)

    return agent


class Session:
    def __init__(self) -> None:
        self.obs: dict[str, Any] | None = None
        self.agent: AgentFn = first_legal_agent
        self.deck0: list[int] | None = None
        self.deck1: list[int] | None = None
        self.agent_path: str | None = None
        self.history: list[list[int]] = []
        self.active = False

    def start(self, deck0: list[int], deck1: list[int], agent_path: str | None) -> dict[str, Any]:
        self.close()
        self.deck0 = list(deck0)
        self.deck1 = list(deck1)
        self.agent_path = agent_path
        self.history = []
        self.agent = load_agent(agent_path)
        obs, start_data = battle_start(deck0, deck1)
        if obs is None or not start_data.battlePtr:
            return {
                "ok": False,
                "error": (
                    "battle_start failed: "
                    f"errorPlayer={start_data.errorPlayer}, errorType={start_data.errorType}"
                ),
            }

        self.obs = obs
        self.active = True
        self.play_ai_turns()
        return self.snapshot()

    def select(self, selection: list[int]) -> dict[str, Any]:
        if not self.active:
            raise RuntimeError("No active CABT battle.")
        self.apply_selection(selection, record=True)
        self.play_ai_turns()
        return self.snapshot()

    def rewind(self, history_length: int) -> dict[str, Any]:
        if self.deck0 is None or self.deck1 is None:
            raise RuntimeError("No CABT battle to rewind.")
        if history_length < 0 or history_length > len(self.history):
            raise RuntimeError(
                f"Invalid rewind history length {history_length}; current={len(self.history)}"
            )

        target_history = [list(item) for item in self.history[:history_length]]
        self.close()
        self.agent = load_agent(self.agent_path)
        obs, start_data = battle_start(self.deck0, self.deck1)
        if obs is None or not start_data.battlePtr:
            return {
                "ok": False,
                "error": (
                    "battle_start failed during rewind: "
                    f"errorPlayer={start_data.errorPlayer}, errorType={start_data.errorType}"
                ),
            }
        self.obs = obs
        self.active = True
        self.history = []
        for selection in target_history:
            self.apply_selection(selection, record=True)
        return self.snapshot()

    def state(self) -> dict[str, Any]:
        return self.snapshot()

    def apply_selection(self, selection: list[int], record: bool) -> None:
        self.obs = battle_select(selection)
        if record:
            self.history.append(list(selection))

    def play_ai_turns(self) -> None:
        for _ in range(200):
            if not self.obs:
                return
            current = self.obs.get("current")
            select = self.obs.get("select")
            if not current or current.get("result", -1) >= 0 or select is None:
                return
            if current.get("yourIndex") != 1:
                return
            action = validate_action(self.obs, self.agent(self.obs), "AI opponent")
            self.apply_selection(action, record=True)
        raise RuntimeError("AI turn limit exceeded.")

    def snapshot(self) -> dict[str, Any]:
        return {
            "ok": True,
            "observation": self.obs,
            "cards": [to_jsonable(card) for card in all_card_data()],
            "attacks": [to_jsonable(attack) for attack in all_attack()],
            "historyLength": len(self.history),
        }

    def close(self) -> None:
        if self.active:
            try:
                battle_finish()
            except Exception:
                pass
        self.obs = None
        self.active = False


def handle(session: Session, message: dict[str, Any]) -> dict[str, Any]:
    command = message.get("command")
    if command == "start":
        return session.start(message["deck0"], message["deck1"], message.get("agentPath"))
    if command == "select":
        return session.select(message["selection"])
    if command == "rewind":
        return session.rewind(int(message["historyLength"]))
    if command == "state":
        return session.state()
    if command == "close":
        session.close()
        return {"ok": True}
    raise ValueError(f"Unknown bridge command: {command}")


def main() -> None:
    session = Session()
    for line in sys.stdin:
        try:
            message = json.loads(line)
            response = handle(session, message)
        except Exception as error:
            response = {
                "ok": False,
                "error": str(error),
                "traceback": traceback.format_exc(),
            }
        response["id"] = message.get("id") if "message" in locals() else None
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
