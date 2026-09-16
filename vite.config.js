import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

export default defineConfig({
  plugins: [
    sites(),
    {
      name: 'sites-static-worker',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'server/index.js',
          source: `export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\n`,
        });
      },
    },
  ],
});
