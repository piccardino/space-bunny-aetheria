/**
 * SHARED BROWSER RESOLVER
 * ========================
 * Every check in this project drives a real browser, and they all needed the
 * same thing: find a Chromium-based browser to drive. Six copies of the same
 * lookup drifted apart, so it lives here once.
 *
 * Brave is PREFERRED over Chrome. It is Chromium underneath, so Puppeteer
 * drives it identically, and its Shields content blockers otherwise sit in the
 * middle of these tests: they rewrite requests, which is exactly the kind of
 * interference a rendering regression test must not have.
 *
 * Resolution order:
 *   1. CHROME_PATH / BROWSER_PATH  — explicit override, always wins
 *   2. Brave
 *   3. Chrome
 *   4. Edge
 *   5. Chromium
 *   6. Puppeteer's own bundled build (returned as undefined)
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES = [
  { name: 'brave', rel: 'BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
  { name: 'chrome', rel: 'Google\\Chrome\\Application\\chrome.exe' },
  { name: 'edge', rel: 'Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'chromium', rel: 'Chromium\\Application\\chrome.exe' },
];

function roots() {
  return [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
}

/**
 * @returns {{ name: string, executablePath: string|undefined, headless: true|'shell' }}
 *   `headless: 'shell'` is only valid for Puppeteer's own build — a system
 *   browser has no separate headless-shell binary, so those get the new
 *   headless mode instead, which is what Brave and Chrome both support.
 */
export function resolveBrowser() {
  const override = process.env.BROWSER_PATH || process.env.CHROME_PATH;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`BROWSER_PATH/CHROME_PATH points at a missing file: ${override}`);
    }
    return { name: 'override', executablePath: override, headless: true };
  }

  for (const root of roots()) {
    for (const { name, rel } of CANDIDATES) {
      const p = join(root, rel);
      if (existsSync(p)) return { name, executablePath: p, headless: true };
    }
  }

  // no system browser: let Puppeteer use its bundled Chromium
  return { name: 'bundled', executablePath: undefined, headless: 'shell' };
}

/** Convenience wrapper for the six scripts that only need the path. */
export function findBrowser() {
  return resolveBrowser().executablePath;
}

/** One line naming the browser, so test output says what it actually ran on. */
export function describeBrowser() {
  const b = resolveBrowser();
  return `${b.name}${b.executablePath ? ` (${b.executablePath})` : ''}`;
}

export default resolveBrowser;
