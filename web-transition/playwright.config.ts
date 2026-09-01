import { defineConfig, devices } from '@playwright/test';

const backendOrigin =
  process.env.BACKEND_ORIGIN ??
  'https://backend-middleware-habitar-inmobiliaria-production.up.railway.app';

const playwrightBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://visualizadorinmuebles.habitarinmobiliaria.co';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: '**/api/**/*.spec.ts',
      use: {
        baseURL: backendOrigin,
      },
    },
    {
      name: 'e2e-chromium',
      testMatch: '**/e2e/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: playwrightBaseUrl,
      },
    },
  ],
});
