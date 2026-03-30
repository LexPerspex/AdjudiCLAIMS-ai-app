import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/soc2-compliance/**/*.test.ts'],
    environment: 'node',
    globals: false,
    typecheck: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      '~': new URL('./app', import.meta.url).pathname,
      '@server': new URL('./server', import.meta.url).pathname,
    },
  },
});
