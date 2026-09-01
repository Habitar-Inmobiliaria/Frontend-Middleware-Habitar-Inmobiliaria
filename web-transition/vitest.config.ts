/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup/vitest.setup.ts'],
      include: ['src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/utils/**'],
      },
    },
  }),
);
