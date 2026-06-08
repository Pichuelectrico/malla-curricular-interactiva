import './setup-env.js';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { SCRAPER_ROOT } from './setup-env.js';

console.log(`Installing Chromium into ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

execSync('bunx playwright install chromium', {
  stdio: 'inherit',
  cwd: SCRAPER_ROOT,
  env: process.env,
});
