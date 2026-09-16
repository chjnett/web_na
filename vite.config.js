import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

export default defineConfig({
  plugins: [
    sites(),
    {
      name: 'sites-static-worker',
      buildStart() {
        rmSync('dist', { recursive: true, force: true });
      },
      closeBundle() {
        mkdirSync('dist/server', { recursive: true });
        writeFileSync(
          'dist/server/index.js',
          `export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\n`,
        );
      },
    },
  ],
  build: {
    outDir: 'dist/client',
  },
});
