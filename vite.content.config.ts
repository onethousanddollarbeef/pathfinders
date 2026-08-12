import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content scripts are injected as classic scripts, so the bundle must be a single
// IIFE with no import statements and no code-splitting.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome114',
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/content-script.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        inlineDynamicImports: true,
      },
    },
  },
});
