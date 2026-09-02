import { defineConfig } from '@playwright/test'

const baseURL = process.env.LIANGXIANG_BROWSER_BASE_URL

if (baseURL === undefined || baseURL.trim() === '') {
  throw new Error('LIANGXIANG_BROWSER_BASE_URL must point at an already-running real DSH WebUI')
}

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  preserveOutput: 'always',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: 'test-results/browser',
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['line']],
  use: {
    baseURL,
    browserName: 'chromium',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' },
    },
    {
      name: 'chromium-narrow',
      use: { viewport: { width: 480, height: 900 }, reducedMotion: 'reduce' },
    },
    {
      name: 'chromium-dark',
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' },
    },
  ],
})
