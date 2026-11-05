import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CdpBridge } from './cdp-bridge.js';
import { initVault, listProfiles, switchProfile, snapshotCurrentSession, removeProfile, updateProfileLabel, syncActiveSession } from './vault-manager.js';
import { getAllAccountsQuotaSummary, fetchActiveQuota } from './quota-poller.js';
import { AutoSwitcher } from './auto-switcher.js';
import { checkForUpdates } from './update-checker.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSS_PATH = path.join(__dirname, '..', 'injector', 'modal.css');
const UI_JS_PATH = path.join(__dirname, '..', 'injector', 'modal-ui.js');

const PORT = 51444;
const HOST = '127.0.0.1';

let isSwitchingInProgress = false;

/**
 * Centralized, risk-free account switch pipeline:
 * 1. Mutex guard to prevent overlapping switches
 * 2. switchProfile(targetId) to write Windows Credential Manager & update vault
 * 3. Fast-path exit if target account is already active
 * 4. LanguageServerService/Restart RPC via CDP with awaitPromise=true & 2.5s AbortSignal timeout
 * 5. 300ms settling pause, then cdp.reloadWindow()
 * 6. Always releases mutex in finally block
 */
export async function executeAccountSwitch(targetId, cdp) {
  if (isSwitchingInProgress) {
    logger.warn('sidecar', `[SWITCH_REJECTED] Switch to ${targetId} rejected because another switch is in progress.`);
    throw new Error('A switch is already in progress. Please wait a moment.');
  }

  logger.info('sidecar', `[SWITCH_START] Switching to profile: ${targetId}`);
  isSwitchingInProgress = true;

  try {
    // Step 1: Write target credentials to Windows Credential Manager & update vault
    const switched = switchProfile(targetId);

    // Fast-path: Account is already active -> No restart or reload needed!
    if (switched.alreadyActive) {
      logger.info('sidecar', `[SWITCH_FASTPATH] Profile ${switched.email} is already active. Returning immediately.`);
      return { ok: true, alreadyActive: true, profile: switched };
    }

    // Step 2: Restart Language Server (dropping in-memory cache so it re-reads target credentials)
    if (cdp && cdp.isConnected) {
      try {
        logger.info('sidecar', '[SWITCH_RPC] Calling LanguageServerService/Restart');
        await cdp.evaluate(`(async () => {
          try {
            const port = window.location.port || '51339';
            const csrf = window.__APP_CONFIG__?.csrfToken || '';
            if (!port) {
              console.warn('[switcher] Missing port, proceeding to window reload');
              return;
            }

            const headers = {
              'Content-Type': 'application/json',
              'x-codeium-csrf-token': csrf
            };

            try {
              await fetch('https://127.0.0.1:' + port + '/exa.language_server_pb.LanguageServerService/Restart', {
                method: 'POST',
                headers,
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(2500)
              });
            } catch (e) {
              console.warn('[switcher] Restart warning:', e);
            }
          } catch (e) {
            console.error('[switcher] Error in switch pipeline:', e);
          }
        })()`, true, 3500);
      } catch (cdpErr) {
        logger.warn('sidecar', `CDP evaluate error during Restart: ${cdpErr.message}`);
      }

      // Step 3: Wait 300ms, then trigger cdp.reloadWindow()
      await new Promise(r => setTimeout(r, 300));
      try {
        logger.info('sidecar', '[SWITCH_RELOAD] Executing window reload');
        await cdp.reloadWindow();
      } catch (rErr) {
        logger.error('sidecar', 'Window reload error', rErr);
      }
    } else {
      logger.warn('sidecar', '[SWITCH_NO_CDP] CDP bridge not connected, only credentials switched.');
    }

    return { ok: true, profile: switched };
  } finally {
    isSwitchingInProgress = false;
    logger.info('sidecar', '[SWITCH_COMPLETE] Switch lock released');
  }
}

async function main() {
  logger.info('sidecar', '==================================================');
  logger.info('sidecar', '🚀 Antigravity Account Switcher Sidecar Starting...');
  logger.info('sidecar', '==================================================');

  // 1. Initialize vault and sync active session
  try {
    initVault();
    syncActiveSession();
  } catch (err) {
    logger.error('sidecar', 'Error during initial vault/session sync', err);
  }

  // 2. Initialize CDP Bridge
  const cdp = new CdpBridge();
  const autoSwitcher = new AutoSwitcher(cdp);

  // 3. Start local HTTP API for in-DOM UI communication
  const server = http.createServer(async (req, res) => {
    // Enable CORS for localhost renderer
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const pathname = url.pathname;

    let body = {};
    if (req.method === 'POST') {
      try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        const text = Buffer.concat(buffers).toString('utf8');
        if (text) body = JSON.parse(text);
      } catch {}
    }

    try {
      if (pathname === '/api/accounts' && req.method === 'GET') {
        const summary = await getAllAccountsQuotaSummary(cdp);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accounts: summary, autoSwitch: autoSwitcher.isEnabled }));
        return;
      }

      if (pathname === '/api/refresh' && req.method === 'POST') {
        try { syncActiveSession(); } catch (err) { logger.error('sidecar', 'Error during refresh sync', err); }
        const summary = await getAllAccountsQuotaSummary(cdp);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accounts: summary, autoSwitch: autoSwitcher.isEnabled }));
        return;
      }

      if (pathname === '/api/logs' && req.method === 'GET') {
        const lines = parseInt(url.searchParams.get('lines') || '100', 10);
        const recent = logger.getRecentLogs(lines);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, logFile: logger.getLogFilePath(), logs: recent }));
        return;
      }

      if (pathname === '/api/toggle-auto-switch' && req.method === 'POST') {
        autoSwitcher.setEnabled(body.enabled);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, autoSwitch: autoSwitcher.isEnabled }));
        return;
      }

      if (pathname === '/api/switch' && req.method === 'POST') {
        const { id } = body;
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing account id' }));
          return;
        }

        try {
          const result = await executeAccountSwitch(id, cdp);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (switchErr) {
          const statusCode = switchErr.message.includes('already in progress') ? 409 : 500;
          logger.error('sidecar', '[SWITCH_ERROR]', switchErr);
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: switchErr.message }));
        }
        return;
      }

      if (pathname === '/api/add-account' && req.method === 'POST') {
        logger.info('sidecar', 'User requested Add Account flow.');
        // 1. Snapshot current active session to ensure it is not lost
        snapshotCurrentSession();

        // 2. Instruct renderer to log out and show login page
        await cdp.evaluate(`(async () => {
          try {
            const csrf = window.__APP_CONFIG__?.csrfToken || '';
            const port = window.location.port;
            if (!port) return;
            await fetch('https://127.0.0.1:' + port + '/exa.language_server_pb.LanguageServerService/AuthLogout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-codeium-csrf-token': csrf },
              body: JSON.stringify({})
            });
            window.location.reload();
          } catch (e) {
            console.error('Logout error:', e);
          }
        })()`, false, 4000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Logged out. Please log in with the new account.' }));
        return;
      }

      if (pathname === '/api/delete-account' && req.method === 'POST') {
        const { id } = body;
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing account id' }));
          return;
        }

        try {
          removeProfile(id);
          logger.info('sidecar', `Account deleted: ${id}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (delErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: delErr.message }));
        }
        return;
      }

      if (pathname === '/api/rename-account' && req.method === 'POST') {
        const { id, label } = body;
        if (!id || !label) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing account id or label' }));
          return;
        }

        const updated = updateProfileLabel(id, label);
        if (!updated) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Account not found' }));
          return;
        }

        logger.info('sidecar', `Account ${id} renamed to "${label}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, profile: updated }));
        return;
      }

      if (pathname === '/api/check-update' && req.method === 'GET') {
        const force = url.searchParams.get('force') === 'true';
        const info = await checkForUpdates(force);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info));
        return;
      }

      // 404 fallback
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err) {
      logger.error('sidecar', 'API error', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(PORT, HOST, () => {
    logger.info('sidecar', `Local API Server listening on http://${HOST}:${PORT}`);
  });

  // 4. Inject UI into renderer window
  async function injectUI() {
    try {
      const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
      const uiJsContent = fs.readFileSync(UI_JS_PATH, 'utf8');

      // Inject UI Engine script
      await cdp.evaluate(uiJsContent, false, 5000);

      // Initialize UI Engine with styles
      const initExpr = `if (window.__AGY_SWITCHER__) { window.__AGY_SWITCHER__.init(${JSON.stringify(cssContent)}); }`;
      await cdp.evaluate(initExpr, false, 5000);

      logger.info('sidecar', 'Successfully injected Account Switcher UI into Antigravity sidebar.');
    } catch (err) {
      logger.error('sidecar', 'Failed to inject UI', err);
    }
  }

  cdp.on('connected', async () => {
    // Wait briefly for DOM to be ready
    setTimeout(async () => {
      await injectUI();
    }, 1500);
  });

  // Watch for page reloads to re-inject UI & sync active session
  let pageLoadDebounce = null;
  cdp.on('event', async (data) => {
    // Only listen for real Page.loadEventFired (never spam with Page.navigatedWithinDocument)
    if (data.method === 'Page.loadEventFired') {
      if (pageLoadDebounce) clearTimeout(pageLoadDebounce);
      pageLoadDebounce = setTimeout(async () => {
        logger.info('sidecar', 'Page loadEventFired detected. Syncing session & injecting UI.');
        try { syncActiveSession(); } catch {}
        await injectUI();
      }, 1200);
    }
  });

  // Watchdog: Ensure UI is injected even if page loaded before connection
  setInterval(async () => {
    if (cdp.isConnected && !isSwitchingInProgress) {
      try {
        const injected = await cdp.evaluate('!!document.getElementById("agy-avatar-trigger-btn")', true, 2000);
        if (!injected) {
          await injectUI();
        }
      } catch {}
    }
  }, 4000);

  // Connect CDP
  await cdp.connect();
}

main().catch(err => {
  logger.error('sidecar', 'Fatal error', err);
  process.exit(1);
});
