import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CdpBridge } from './cdp-bridge.js';
import { initVault, listProfiles, switchProfile, snapshotCurrentSession } from './vault-manager.js';
import { getAllAccountsQuotaSummary, fetchActiveQuota } from './quota-poller.js';
import { AutoSwitcher } from './auto-switcher.js';
import { checkForUpdates } from './update-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSS_PATH = path.join(__dirname, '..', 'injector', 'modal.css');
const UI_JS_PATH = path.join(__dirname, '..', 'injector', 'modal-ui.js');

const PORT = 51444;
const HOST = '127.0.0.1';

async function main() {
  console.log('==================================================');
  console.log('🚀 Antigravity Account Switcher Sidecar Starting...');
  console.log('==================================================');

  // 1. Initialize vault
  initVault();

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
        const summary = await getAllAccountsQuotaSummary(cdp);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accounts: summary, autoSwitch: autoSwitcher.isEnabled }));
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

        console.log(`[sidecar] Switching to profile: ${id}`);
        const switched = switchProfile(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, profile: switched }));

        // Trigger soft window reload via CDP
        setTimeout(async () => {
          await cdp.reloadWindow();
        }, 300);
        return;
      }

      if (pathname === '/api/add-account' && req.method === 'POST') {
        console.log('[sidecar] User requested Add Account flow.');
        // 1. Snapshot current active session to ensure it is not lost
        snapshotCurrentSession();

        // 2. Instruct renderer to log out and show login page
        await cdp.evaluate(`(async () => {
          try {
            const csrf = window.__APP_CONFIG__?.csrfToken || '';
            const port = window.location.port || '51339';
            await fetch('https://127.0.0.1:' + port + '/exa.language_server_pb.LanguageServerService/AuthLogout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-codeium-csrf-token': csrf },
              body: JSON.stringify({})
            });
            window.location.reload();
          } catch (e) {
            console.error('Logout error:', e);
          }
        })()`, false);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Logged out. Please log in with the new account.' }));
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
      console.error('[sidecar] API error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[sidecar] Local API Server listening on http://${HOST}:${PORT}`);
  });

  // 4. Inject UI into renderer window
  async function injectUI() {
    try {
      const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
      const uiJsContent = fs.readFileSync(UI_JS_PATH, 'utf8');

      // Inject UI Engine script
      await cdp.evaluate(uiJsContent, false);

      // Initialize UI Engine with styles
      const initExpr = `if (window.__AGY_SWITCHER__) { window.__AGY_SWITCHER__.init(${JSON.stringify(cssContent)}); }`;
      await cdp.evaluate(initExpr, false);

      console.log('[sidecar] Successfully injected Account Switcher UI into Antigravity sidebar.');
    } catch (err) {
      console.error('[sidecar] Failed to inject UI:', err.message);
    }
  }

  cdp.on('connected', async () => {
    // Wait briefly for DOM to be ready
    setTimeout(async () => {
      await injectUI();
    }, 1500);
  });

  // Watch for page reloads / navigations to re-inject UI
  cdp.on('event', async (data) => {
    if (data.method === 'Page.loadEventFired' || data.method === 'Page.navigatedWithinDocument') {
      setTimeout(async () => {
        await injectUI();
      }, 1500);
    }
  });

  // Watchdog: Ensure UI is injected even if page loaded before connection
  setInterval(async () => {
    if (cdp.isConnected) {
      try {
        const injected = await cdp.evaluate('!!document.getElementById("agy-avatar-trigger-btn")');
        if (!injected) {
          await injectUI();
        }
      } catch {}
    }
  }, 3500);

  // Connect CDP
  await cdp.connect();
}

main().catch(err => {
  console.error('[sidecar] Fatal error:', err);
  process.exit(1);
});
