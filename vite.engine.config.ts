import { defineConfig } from 'vite';

/** Builds the engine as one self-contained script that game iframes and exports inline. */
export default defineConfig({
  publicDir: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'public',
    emptyOutDir: false,
    copyPublicDir: false,
    chunkSizeWarningLimit: 2500,
    lib: { entry: 'engine/standalone.ts', name: 'GameEngine', formats: ['iife'], fileName: () => 'engine.js' },
  },
});
