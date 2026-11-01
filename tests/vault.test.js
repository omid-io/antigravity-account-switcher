import test from 'node:test';
import assert from 'node:assert/strict';
import { listProfiles, initVault } from '../src/sidecar/vault-manager.js';
import { calculateResetCountdown } from '../src/sidecar/quota-poller.js';

test('Vault initialization creates valid profiles list', () => {
  const profiles = initVault();
  assert.ok(Array.isArray(profiles), 'Profiles should be an array');
  assert.ok(profiles.length >= 1, 'Should have at least 1 account in vault');
  const active = profiles.find(p => p.isActive);
  assert.ok(active, 'Should have an active account marked');
  assert.ok(active.email.includes('@'), 'Active account should have a valid email');
});

test('listProfiles returns existing accounts', () => {
  const profiles = listProfiles();
  assert.ok(profiles.length >= 1);
  assert.ok(profiles[0].id);
  assert.ok(profiles[0].label);
});

test('calculateResetCountdown correctly formats time', () => {
  // Test null / undefined
  const resNull = calculateResetCountdown(null);
  assert.equal(resNull.isExpired, true);
  assert.equal(resNull.text, 'Refreshed');

  // Test past date
  const pastDate = new Date(Date.now() - 60000).toISOString();
  const resPast = calculateResetCountdown(pastDate);
  assert.equal(resPast.isExpired, true);

  // Test future date (2 hours 30 mins)
  const futureDate = new Date(Date.now() + 150 * 60000).toISOString();
  const resFuture = calculateResetCountdown(futureDate);
  assert.equal(resFuture.isExpired, false);
  assert.ok(resFuture.text.includes('h') || resFuture.text.includes('m'));
});
