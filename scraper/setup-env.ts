import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const browsersDir = join(rootDir, 'browsers');

// Always use local browsers dir so scripts work without manual env vars
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir;

export const SCRAPER_ROOT = rootDir;
export const BROWSERS_DIR = browsersDir;

export function ensureBrowsersInstalled(): void {
  const hasChromium =
    existsSync(join(BROWSERS_DIR, 'chromium-1223')) ||
    existsSync(join(BROWSERS_DIR, 'chromium_headless_shell-1223'));

  if (!existsSync(BROWSERS_DIR) || !hasChromium) {
    console.error(
      'Playwright browsers not found.\n' +
      'Run once from the scraper folder:\n' +
      '  bun run setup'
    );
    process.exit(1);
  }
}
