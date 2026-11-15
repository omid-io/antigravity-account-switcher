import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.AGY_SIDECAR_NO_START = '1';

const { selectMainTarget } = await import('../src/sidecar/cdp-bridge.js');
const { listenWithFallback } = await import('../src/sidecar/index.js');
const { getActiveEmailFromAppStorage, updateAppStorageEmail } = await import('../src/sidecar/vault-manager.js');

test('selectMainTarget skips embedded web pages and picks Antigravity 2.x window', () => {
  const targets = [
    { type: 'page', title: 'Local App', url: 'http://localhost:1420/' },
    { type: 'page', title: 'about:blank', url: 'about:blank' },
    { type: 'page', title: 'Splash', url: 'data:text/html,<html></html>' },
    { type: 'iframe', title: 'Swarm', url: 'plugin://swarm/' },
    { type: 'page', title: 'Workspace - Antigravity', url: 'https://127.0.0.1:63576/c/abc' }
  ];

  const picked = selectMainTarget(targets);
  assert.equal(picked?.url, 'https://127.0.0.1:63576/c/abc');
});

test('selectMainTarget continues supporting legacy workbench.html windows', () => {
  const targets = [
    { type: 'page', title: 'Other', url: 'http://localhost:3000/' },
    { type: 'page', title: 'Antigravity', url: 'vscode-file://vscode-app/workbench.html' }
  ];

  const picked = selectMainTarget(targets);
  assert.equal(picked?.url, 'vscode-file://vscode-app/workbench.html');
});

test('listenWithFallback falls back cleanly when preferred port is occupied', async () => {
  const blocker = http.createServer();
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const occupiedPort = blocker.address().port;

  const server = http.createServer();
  try {
    const boundPort = await listenWithFallback(server, '127.0.0.1', occupiedPort);
    assert.ok(boundPort > 0);
    assert.notEqual(boundPort, occupiedPort);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => blocker.close(resolve));
  }
});

test('app_storage helpers support both agy and jetski onboarding username keys', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-switcher-test-'));
  const storagePath = path.join(tmpDir, 'app_storage.json');

  try {
    fs.writeFileSync(storagePath, JSON.stringify({
      'agy.onboarding.lastLoginUsername': 'v232@example.com'
    }), 'utf8');

    assert.equal(getActiveEmailFromAppStorage(storagePath), 'v232@example.com');
    assert.equal(updateAppStorageEmail('next@example.com', storagePath), true);
    const updatedV232 = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    assert.equal(updatedV232['agy.onboarding.lastLoginUsername'], 'next@example.com');

    fs.writeFileSync(storagePath, JSON.stringify({
      'jetski.onboarding.lastLoginUsername': 'legacy@example.com'
    }), 'utf8');

    assert.equal(getActiveEmailFromAppStorage(storagePath), 'legacy@example.com');
    assert.equal(updateAppStorageEmail('switched@example.com', storagePath), true);
    const updatedLegacy = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    assert.equal(updatedLegacy['jetski.onboarding.lastLoginUsername'], 'switched@example.com');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
