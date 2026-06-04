import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // Enable CSS processing so `import styles from './x.module.scss'` returns
    // a real classname map AND the compiled CSS is injected as a `<style>`
    // tag into happy-dom. The WP02 view tests rely on `getComputedStyle()`
    // reading values cascaded from CSS-module rules; without `css: true`
    // Vite stubs the imports and the assertions cannot fire.
    css: true,
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: './test/setup.ts',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types/**', 'src/**/*.d.ts'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
