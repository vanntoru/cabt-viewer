from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import random
import sys
import traceback
from collections import Counter
from pathlib import Path
from typing import Any, Callable


FRONTEND_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = FRONTEND_ROOT.parent
SAMPLE_SUBMISSION = Path(
    os.environ.get(
        "CABT_SAMPLE_SUBMISSION_DIR",
        FRONTEND_ROOT / "sample_submission",
    )
).resolve()
sys.path.insert(0, str(SAMPLE_SUBMISSION))

from cg.api import (  # noqa: E402
    all_attack,
    all_card_data,
    search_begin,
    search_end,
    search_release,
    search_step,
    to_observation_class,
)
from cg.game import battle_finish, battle_select, battle_start  # noqa: E402


AgentFn = Callable[[dict[str, Any]], list[int]]
MAX_AUTO_STEPS = 10000


TAKEOVER_SCHEMA_VERSION = "ptcg-cabt-replay-takeover-v1"
_BASIC_IDS: set[int] | None = None


def basic_card_ids() -> set[int]:
    global _BASIC_IDS
    if _BASIC_IDS is None:
        _BASIC_IDS = {
            int(card.cardId)
            for card in all_card_data()
            if bool(getattr(card, "basic", False))
        }
    return _BASIC_IDS


def nested_cards(cards: Any) -> list[tuple[int, int | None]]:
    rows: list[tuple[int, int | None]] = []
    for card in cards or []:
        if not isinstance(card, dict):
            continue
        card_id = card.get("id")
        serial = card.get("serial")
        if isinstance(card_id, int):
            rows.append((int(card_id), int(serial) if isinstance(serial, int) else None))
        for key in ("preEvolution", "energyCards", "tools"):
            rows.extend(nested_cards(card.get(key)))
    return rows


def known_card_ids(frame: dict[str, Any], seat: int, include_hand: bool) -> list[int]:
    current = frame.get("current") or {}
    players = current.get("players") or []
    if seat >= len(players) or not isinstance(players[seat], dict):
        raise ValueError(f"takeover root has no player {seat}")
    player = players[seat]
    rows: list[tuple[int, int | None]] = []
    for key in ("active", "bench", "discard", "prize"):
        rows.extend(nested_cards(player.get(key)))
    if include_hand:
        rows.extend(nested_cards(player.get("hand")))
    if current.get("yourIndex") == seat:
        rows.extend(nested_cards(current.get("looking")))
    seen = {serial for _, serial in rows if serial is not None}
    for card in current.get("stadium") or []:
        if not isinstance(card, dict) or card.get("playerIndex") != seat:
            continue
        card_id = card.get("id")
        if not isinstance(card_id, int):
            continue
        serial = card.get("serial") if isinstance(card.get("serial"), int) else None
        if serial is None or serial not in seen:
            rows.append((int(card_id), serial))
            if serial is not None:
                seen.add(serial)
    select = frame.get("select") or {}
    for key in ("effect", "contextCard"):
        card = select.get(key)
        if not isinstance(card, dict) or card.get("playerIndex") != seat:
            continue
        card_id = card.get("id")
        if not isinstance(card_id, int):
            continue
        serial = card.get("serial") if isinstance(card.get("serial"), int) else None
        if serial is None or serial not in seen:
            rows.append((int(card_id), serial))
            if serial is not None:
                seen.add(serial)
    return [card_id for card_id, _ in rows]


def stable_world_seed(root: dict[str, Any], seed: int) -> int:
    encoded = json.dumps(
        {
            "seed": int(seed),
            "search": root.get("search_begin_input"),
            "turn": (root.get("current") or {}).get("turn"),
            "actor": (root.get("current") or {}).get("yourIndex"),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return int.from_bytes(hashlib.sha256(encoded).digest()[:8], "big")


def build_takeover_world(
    root: dict[str, Any],
    decks: list[list[int]],
    seed: int,
) -> dict[int, dict[str, list[int]]]:
    current = root.get("current") or {}
    actor = current.get("yourIndex")
    if actor not in (0, 1):
        raise ValueError("takeover root has no acting seat")
    players = current.get("players") or []
    if len(players) != 2:
        raise ValueError("takeover requires exactly two players")
    if not isinstance(players[actor].get("hand"), list):
        raise ValueError("takeover requires rawVisualize with the acting seat hand")
    rng = random.Random(stable_world_seed(root, seed))
    basics = basic_card_ids()
    zones: dict[int, dict[str, list[int]]] = {}
    for seat in (0, 1):
        full = Counter(int(card_id) for card_id in decks[seat])
        known = Counter(known_card_ids(root, seat, seat == actor))
        impossible = known - full
        if impossible:
            raise ValueError(f"takeover deck mismatch seat {seat}: {dict(impossible)}")
        remaining = full - known
        player = players[seat]
        deck_count = int(player.get("deckCount", 0) or 0)
        prize_rows = player.get("prize") or []
        known_prizes = [card_id for card_id, _ in nested_cards(prize_rows)]
        unknown_prize_count = max(0, len(prize_rows) - len(known_prizes))
        hidden_hand_count = 0 if seat == actor else int(player.get("handCount", 0) or 0)
        face_down_count = sum(card is None for card in (player.get("active") or [])) + sum(
            card is None for card in (player.get("bench") or [])
        )

        exact_deck: list[int] = []
        select = root.get("select") or {}
        if seat == actor and isinstance(select.get("deck"), list):
            exact_deck = [
                int(card["id"])
                for card in select["deck"]
                if isinstance(card, dict) and isinstance(card.get("id"), int)
            ]
        if exact_deck and len(exact_deck) == deck_count and not (Counter(exact_deck) - remaining):
            leftover = remaining - Counter(exact_deck)
            sampled_prizes = list(leftover.elements())
            if len(sampled_prizes) == unknown_prize_count:
                rng.shuffle(sampled_prizes)
                zones[seat] = {
                    "deck": exact_deck,
                    "prize": [*known_prizes, *sampled_prizes],
                    "hand": [],
                    "active": [],
                }
                continue

        pool = list(remaining.elements())
        rng.shuffle(pool)
        cursor = 0
        hidden_hand = pool[cursor : cursor + hidden_hand_count]
        cursor += hidden_hand_count
        hidden_active: list[int] = []
        for _ in range(face_down_count):
            basic_pos = next((index for index in range(cursor, len(pool)) if pool[index] in basics), None)
            if basic_pos is None:
                raise ValueError(f"takeover has no hidden Basic available for seat {seat}")
            pool[cursor], pool[basic_pos] = pool[basic_pos], pool[cursor]
            hidden_active.append(pool[cursor])
            cursor += 1
        sampled_prizes = pool[cursor : cursor + unknown_prize_count]
        cursor += unknown_prize_count
        hidden_deck = pool[cursor : cursor + deck_count]
        cursor += deck_count
        if cursor != len(pool):
            raise ValueError(f"takeover hidden accounting seat {seat}: {cursor}/{len(pool)}")
        zones[seat] = {
            "deck": hidden_deck,
            "prize": [*known_prizes, *sampled_prizes],
            "hand": hidden_hand,
            "active": hidden_active,
        }
    return zones




def canonical_public_contract(value: Any) -> Any:
    if isinstance(value, list):
        return [canonical_public_contract(item) for item in value]
    if isinstance(value, dict):
        is_card = isinstance(value.get("id"), int) and isinstance(value.get("serial"), int)
        return {
            key: canonical_public_contract(item)
            for key, item in value.items()
            if item is not None and not (is_card and key == "playerIndex")
        }
    return value


def public_root_contract(obs: dict[str, Any]) -> dict[str, Any]:
    current = obs.get("current") or {}
    actor = current.get("yourIndex")
    players_out: list[dict[str, Any]] = []
    for seat, player in enumerate(current.get("players") or []):
        player = player or {}
        players_out.append({
            "active": player.get("active"),
            "bench": player.get("bench"),
            "benchMax": player.get("benchMax"),
            "deckCount": player.get("deckCount"),
            "discard": player.get("discard"),
            "prizeCount": len(player.get("prize") or []),
            "handCount": player.get("handCount"),
            "hand": player.get("hand") if seat == actor else None,
            "poisoned": player.get("poisoned"),
            "burned": player.get("burned"),
            "asleep": player.get("asleep"),
            "paralyzed": player.get("paralyzed"),
            "confused": player.get("confused"),
        })
    select = obs.get("select") or {}
    return {
        "current": {
            key: current.get(key)
            for key in (
                "turn", "turnActionCount", "yourIndex", "firstPlayer",
                "supporterPlayed", "stadiumPlayed", "energyAttached",
                "retreated", "result", "stadium", "lookingCount", "looking",
            )
        } | {"players": players_out},
        "select": {
            key: select.get(key)
            for key in ("context", "option", "minCount", "maxCount", "deck", "effect", "contextCard")
        },
    }


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
    return list(range(select["maxCount"]))


def load_agent(agent_path: str | None) -> tuple[AgentFn, Callable | None]:
    """Returns (agent, set_deck). set_deck is an optional module hook
    called as set_deck(deck, seat) before battle start so deck-general
    agents can condition on whatever deck their seat was given."""
    if not agent_path:
        return first_legal_agent, None

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

    agent = getattr(module, "agent", None)
    if not callable(agent):
        raise AttributeError(f"{path} does not export callable agent(obs)")
    set_deck = getattr(module, "set_deck", None)
    return agent, set_deck if callable(set_deck) else None


class Session:
    def __init__(self) -> None:
        self.obs: dict[str, Any] | None = None
        self.agents: list[AgentFn] = [first_legal_agent, first_legal_agent]
        self.agent_controlled = [False, True]
        self.active = False
        self.mode = 'battle'
        self.search_state = None
        self.takeover_receipt: dict[str, Any] | None = None

    def start(
        self,
        deck0: list[int],
        deck1: list[int],
        agent_paths: list[str | None],
        agent_controlled: list[bool],
    ) -> dict[str, Any]:
        self.close()
        self.mode = 'battle'
        self.takeover_receipt = None
        self.agent_controlled = normalize_agent_controlled(agent_controlled)
        loaded = [load_agent(path) for path in normalize_agent_paths(agent_paths)]
        self.agents = [agent for agent, _ in loaded]
        for seat, (deck, (_, set_deck)) in enumerate(zip((deck0, deck1), loaded)):
            if set_deck is not None:
                set_deck(list(deck), seat)
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
        auto_steps, auto_actions = self.play_ai_turns()
        return self.snapshot([obs, *auto_steps], [None, *auto_actions])



    def start_takeover(
        self,
        deck0: list[int],
        deck1: list[int],
        root_observation: dict[str, Any],
        human_seat: int,
        agent_paths: list[str | None],
        seed: int,
    ) -> dict[str, Any]:
        self.close()
        if human_seat not in (0, 1):
            raise ValueError("takeover humanSeat must be 0 or 1")
        if len(deck0) != 60 or len(deck1) != 60:
            raise ValueError("takeover requires both saved 60-card decks")
        if not isinstance(root_observation, dict) or not root_observation.get("search_begin_input"):
            raise ValueError("selected replay state has no search_begin_input")
        current = root_observation.get("current") or {}
        if int(current.get("result", -1)) >= 0:
            raise ValueError("cannot take over a terminal replay state")
        actor = current.get("yourIndex")
        if actor not in (0, 1):
            raise ValueError("selected replay state has no acting seat")

        loaded = [load_agent(path) for path in normalize_agent_paths(agent_paths)]
        self.agents = [agent for agent, _ in loaded]
        for seat, (deck, (_, set_deck)) in enumerate(zip((deck0, deck1), loaded)):
            if set_deck is not None:
                set_deck(list(deck), seat)
        self.agent_controlled = [seat != human_seat for seat in (0, 1)]
        world = build_takeover_world(root_observation, [list(deck0), list(deck1)], int(seed))
        own = world[actor]
        opponent = world[1 - actor]
        state = search_begin(
            to_observation_class(root_observation),
            own["deck"],
            own["prize"],
            opponent["deck"],
            opponent["prize"],
            opponent["hand"],
            opponent["active"],
            False,
        )
        root_after = to_jsonable(state.observation)
        if canonical_public_contract(public_root_contract(root_after)) != canonical_public_contract(public_root_contract(root_observation)):
            search_release(state.searchId)
            search_end()
            raise ValueError("Search API takeover root does not match the saved public state")
        self.mode = 'search'
        self.search_state = state
        self.obs = root_after
        self.active = True
        world_payload = {str(seat): zones for seat, zones in world.items()}
        world_sha = hashlib.sha256(
            json.dumps(world_payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        self.takeover_receipt = {
            "schemaVersion": TAKEOVER_SCHEMA_VERSION,
            "worldMode": "determinized-public-root",
            "seed": int(seed),
            "rootActor": int(actor),
            "humanSeat": int(human_seat),
            "worldSha256": world_sha,
            "world": world_payload,
        }
        auto_steps, auto_actions = self.play_ai_turns()
        return self.snapshot([root_after, *auto_steps], [None, *auto_actions])

    def select(self, selection: list[int]) -> dict[str, Any]:
        if not self.active:
            raise RuntimeError("No active CABT battle.")
        if self.mode == 'search':
            if self.search_state is None:
                raise RuntimeError('No active takeover search state.')
            previous_id = self.search_state.searchId
            next_state = search_step(previous_id, selection)
            search_release(previous_id)
            self.search_state = next_state
            selected_step = to_jsonable(next_state.observation)
        else:
            selected_step = battle_select(selection)
        self.obs = selected_step
        auto_steps, auto_actions = self.play_ai_turns()
        return self.snapshot([selected_step, *auto_steps], [list(selection), *auto_actions])

    def state(self) -> dict[str, Any]:
        return self.snapshot()

    def play_ai_turns(self) -> tuple[list[dict[str, Any]], list[list[int]]]:
        auto_steps: list[dict[str, Any]] = []
        auto_actions: list[list[int]] = []
        for _ in range(MAX_AUTO_STEPS):
            if not self.obs:
                return auto_steps, auto_actions
            current = self.obs.get("current")
            select = self.obs.get("select")
            if not current or current.get("result", -1) >= 0 or select is None:
                return auto_steps, auto_actions
            player_index = current.get("yourIndex")
            if player_index not in (0, 1) or not self.agent_controlled[player_index]:
                return auto_steps, auto_actions
            action = self.agents[player_index](self.obs)
            if self.mode == 'search':
                if self.search_state is None:
                    raise RuntimeError('No active takeover search state.')
                previous_id = self.search_state.searchId
                next_state = search_step(previous_id, action)
                search_release(previous_id)
                self.search_state = next_state
                self.obs = to_jsonable(next_state.observation)
            else:
                self.obs = battle_select(action)
            auto_steps.append(self.obs)
            auto_actions.append(list(action))
        raise RuntimeError(f"AI auto-play limit exceeded ({MAX_AUTO_STEPS} selections).")

    def snapshot(
        self,
        auto_steps: list[dict[str, Any]] | None = None,
        auto_actions: list[list[int] | None] | None = None,
    ) -> dict[str, Any]:
        return {
            "ok": True,
            "observation": self.obs,
            "autoSteps": auto_steps or [],
            # autoActions[i] is the selection that produced autoSteps[i]
            # (None for an initial observation nothing acted on).
            "autoActions": auto_actions or [],
            "cards": [to_jsonable(card) for card in all_card_data()],
            "attacks": [to_jsonable(attack) for attack in all_attack()],
            "takeover": self.takeover_receipt,
        }

    def close(self) -> None:
        if self.active:
            try:
                if self.mode == 'search':
                    if self.search_state is not None:
                        search_release(self.search_state.searchId)
                    search_end()
                else:
                    battle_finish()
            except Exception:
                pass
        self.obs = None
        self.search_state = None
        self.takeover_receipt = None
        self.mode = 'battle'
        self.agent_controlled = [False, True]
        self.active = False


def normalize_agent_paths(agent_paths: Any) -> list[str | None]:
    if not isinstance(agent_paths, list):
        return [None, None]
    return [
        agent_paths[0] if len(agent_paths) > 0 and isinstance(agent_paths[0], str) else None,
        agent_paths[1] if len(agent_paths) > 1 and isinstance(agent_paths[1], str) else None,
    ]


def normalize_agent_controlled(agent_controlled: Any) -> list[bool]:
    if not isinstance(agent_controlled, list):
        return [False, True]
    return [
        bool(agent_controlled[0]) if len(agent_controlled) > 0 else False,
        bool(agent_controlled[1]) if len(agent_controlled) > 1 else True,
    ]


def handle(session: Session, message: dict[str, Any]) -> dict[str, Any]:
    command = message.get("command")
    if command == "start":
        agent_paths = message.get("agentPaths")
        agent_controlled = message.get("agentControlled")
        if not isinstance(agent_paths, list):
            agent_paths = [None, message.get("agentPath")]
        if not isinstance(agent_controlled, list):
            agent_controlled = [False, not bool(message.get("manualOpponent"))]
        return session.start(
            message["deck0"],
            message["deck1"],
            agent_paths,
            agent_controlled,
        )
    if command == "startTakeover":
        return session.start_takeover(
            message["deck0"],
            message["deck1"],
            message["rootObservation"],
            int(message["humanSeat"]),
            message.get("agentPaths") or [None, None],
            int(message.get("seed") or 0),
        )
    if command == "select":
        return session.select(message["selection"])
    if command == "state":
        return session.state()
    if command == "close":
        session.close()
        return {"ok": True}
    raise ValueError(f"Unknown bridge command: {command}")


def main() -> None:
    # Protocol writes own the real stdout. Everything else that writes to
    # fd 1 — agent print() calls, native engine output — is redirected to
    # stderr, so a stray write can never corrupt or interleave with a
    # protocol line (an agent print without a trailing newline used to glue
    # itself to the next response and hang the caller forever).
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    session = Session()
    for line in sys.stdin:
        message: dict[str, Any] = {}
        try:
            parsed = json.loads(line)
            message = parsed if isinstance(parsed, dict) else {}
            response = handle(session, message)
        except Exception as error:
            response = {
                "ok": False,
                "error": str(error),
                "traceback": traceback.format_exc(),
            }
        response["id"] = message.get("id")
        print(json.dumps(response, ensure_ascii=False), file=protocol, flush=True)


if __name__ == "__main__":
    main()
