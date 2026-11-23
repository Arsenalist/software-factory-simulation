import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Builds dist/software-factory.js + dist/software-factory.css (+ the worker chunk),
// served from zarar.dev under /software-factory/. base './' keeps every URL relative to the entry module.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    minify: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'software-factory.js', cssFileName: 'software-factory' },
    rollupOptions: { output: { assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'software-factory.css' : 'assets/[name]-[hash][extname]') } },
  },
  worker: { format: 'es' },
  test: { include: ['test/**/*.test.ts'] },
});
