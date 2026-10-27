import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    // The classic flows run on the classic map: headless Chromium has only a software rasteriser, so the game gives it the 2D map by default.
    { name: 'desktop', testIgnore: /world3d\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    {
      name: 'phone',
      testIgnore: /world3d\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    // The 3D world (`?renderer=3d`), on software WebGL: slow, but the real scene through the real interface.
    { name: 'desktop-3d', testMatch: /world3d\.spec\.ts/, timeout: 420_000, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'phone-3d', testMatch: /world3d\.spec\.ts/, timeout: 420_000, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // Cross-browser smoke (opt in: needs `npx playwright install firefox webkit`, and on Linux `npx playwright install-deps webkit`).
    // Run with BE_CROSS_BROWSER=1 npm run test:e2e -- --project=firefox --project=webkit --project=iphone
    ...(process.env.BE_CROSS_BROWSER === '1'
      ? [
          { name: 'firefox', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
          { name: 'webkit', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
          { name: 'iphone', testMatch: /smoke\.spec\.ts/, use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
});
