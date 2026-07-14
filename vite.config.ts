import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const jpCardImageRoot = fileURLToPath(new URL('../card_viewer/images/', import.meta.url));
const localEnginePort = process.env.LOCAL_ENGINE_PORT ?? '8095';

function localJapaneseCardImages(): Plugin {
  return {
    name: 'local-japanese-card-images',
    configureServer(server) {
      server.middlewares.use('/jp-card-images', (req, res, next) => {
        const requestPath = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/+/, ''));
        if (!/^\d{4}\.jpg$/.test(requestPath)) {
          next();
          return;
        }

        const imagePath = join(jpCardImageRoot, requestPath);
        if (!existsSync(imagePath)) {
          res.statusCode = 404;
          res.end('card image not found');
          return;
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        createReadStream(imagePath)
          .on('error', () => {
            if (!res.headersSent) {
              res.statusCode = 500;
            }
            res.end('failed to read card image');
          })
          .pipe(res);
      });
    },
  };
}

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [svelte(), localJapaneseCardImages()],
  server: {
    port: 5173,
    proxy: {
      '/local-engine': {
        target: `http://localhost:${localEnginePort}`,
        changeOrigin: true,
      },
      '/cabt-artifacts': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cabt-artifacts/, ''),
      },
    },
  },
});
