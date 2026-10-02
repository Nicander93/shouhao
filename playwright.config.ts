import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3199',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server/index.ts',
    url: 'http://127.0.0.1:3199/api/health',
    reuseExistingServer: false,
    env: { PORT: '3199', HOST: '127.0.0.1', APP_PASSWORD: '', DATA_DIR: './data/e2e' },
  },
});
