import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end: the real web app (built against the Firebase emulators) + the real Cloud Functions in the emulator.
 * Run from the repo root: pnpm test:e2e   (starts the emulators, then this suite)
 */
export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './seed.ts',
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm --filter ./frontend/web exec vite preview --port 4173 --strictPort',
    cwd: '../..',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
