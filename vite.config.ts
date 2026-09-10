import { defineConfig } from 'vite';

// Config per DEPLOYMENT.md section 2. `base` must not be root-absolute: GitHub Pages
// serves this as a project site at /<repo>/. DEPLOY_BASE overrides it for hosts that
// serve at / (e.g. the documented Cloudflare Pages fallback).
export default defineConfig(({ command, mode }) => ({
  base: process.env.DEPLOY_BASE ?? '/Mysuru-Open-World/',
  build: {
    target: 'es2020',
    sourcemap: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Keep three in its own long-cached chunk. Written as a function rather than
        // `{ three: ['three'] }` so it cannot emit an empty chunk while the scene
        // graph is still being built up (T-1.2 onward).
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  define: {
    __DEV__: JSON.stringify(command === 'serve'),
    __E2E__: JSON.stringify(mode === 'e2e'),
  },
}));
