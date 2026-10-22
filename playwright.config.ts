import { defineConfig } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const tempDirectory = resolve('.cache/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('.cache/ms-playwright');
mkdirSync(tempDirectory, { recursive: true });
for (const variable of ['TEMP', 'TMP', 'TMPDIR']) process.env[variable] = tempDirectory;

const channel = process.env.PLAYWRIGHT_CHANNEL || (!process.env.CI && process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'chrome' : undefined);
const previewUrl = `http://127.0.0.1:${process.env.PREVIEW_PORT || '4322'}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.cache/playwright-results',
  use: { baseURL: process.env.SITE_URL || previewUrl, browserName: 'chromium', channel },
  webServer: process.env.SITE_URL ? undefined : {
    command: `pnpm preview --port ${process.env.PREVIEW_PORT || '4322'}`,
    url: previewUrl,
    reuseExistingServer: false,
  },
});
