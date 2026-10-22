import { defineConfig } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const tempDirectory = resolve('.cache/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('.cache/ms-playwright');
mkdirSync(tempDirectory, { recursive: true });
for (const variable of ['TEMP', 'TMP', 'TMPDIR']) process.env[variable] = tempDirectory;

const channel = process.env.PLAYWRIGHT_CHANNEL || (!process.env.CI && process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'chrome' : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.cache/playwright-results',
  use: { baseURL: process.env.SITE_URL || 'http://127.0.0.1:4321', browserName: 'chromium', channel },
  webServer: process.env.SITE_URL ? undefined : {
    command: 'pnpm preview --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
  },
});
