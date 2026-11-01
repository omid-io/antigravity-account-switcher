import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_PATH = path.join(__dirname, '..', '..', 'package.json');

const GITHUB_REPO = 'omid-io/antigravity-account-switcher';
const NPM_PACKAGE = 'antigravity-account-switcher';

let cachedCheck = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Compares two semver strings (e.g. "1.1.0" and "1.2.0").
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a === b
 */
export function compareSemver(a, b) {
  const pa = (a || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = (b || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);

  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Gets the current local package version.
 */
export function getCurrentVersion() {
  try {
    if (fs.existsSync(PKG_PATH)) {
      const data = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
      return data.version || '1.1.0';
    }
  } catch {}
  return '1.1.0';
}

/**
 * Queries GitHub and npm for the latest version.
 * @param {boolean} forceRefresh
 */
export async function checkForUpdates(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedCheck && (now - lastCheckTime < CACHE_TTL_MS)) {
    return cachedCheck;
  }

  const currentVersion = getCurrentVersion();
  let latestVersion = currentVersion;
  let releaseNotes = '';
  let releaseUrl = `https://github.com/${GITHUB_REPO}`;

  // 1. Try GitHub Releases API first
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'User-Agent': 'antigravity-account-switcher',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.tag_name) {
        latestVersion = data.tag_name.replace(/^v/, '');
        releaseNotes = data.body || '';
        releaseUrl = data.html_url || releaseUrl;
      }
    } else {
      // Fallback: Check raw package.json on master
      const rawRes = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/master/package.json`, {
        headers: { 'User-Agent': 'antigravity-account-switcher' }
      });
      if (rawRes.ok) {
        const rawPkg = await rawRes.json();
        if (rawPkg.version) {
          latestVersion = rawPkg.version;
        }
      }
    }
  } catch (err) {
    // 2. Fallback: Try npm registry
    try {
      const npmRes = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`);
      if (npmRes.ok) {
        const npmData = await npmRes.json();
        if (npmData.version) {
          latestVersion = npmData.version;
        }
      }
    } catch {}
  }

  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

  cachedCheck = {
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseUrl,
    releaseNotes,
    updateCommand: `npx ${NPM_PACKAGE}@latest update`,
    repoUrl: `https://github.com/${GITHUB_REPO}`,
    checkedAt: new Date().toISOString()
  };
  lastCheckTime = now;

  return cachedCheck;
}
