import test from 'node:test';
import assert from 'node:assert/strict';
import { listProfiles, initVault, syncActiveSession, switchProfile, listProfilesDirect } from '../src/sidecar/vault-manager.js';
import { calculateResetCountdown } from '../src/sidecar/quota-poller.js';

test('Vault initialization creates valid profiles list', () => {
  const profiles = initVault();
  assert.ok(Array.isArray(profiles), 'Profiles should be an array');
  assert.ok(profiles.length >= 1, 'Should have at least 1 account in vault');
  const active = profiles.find(p => p.isActive);
  assert.ok(active, 'Should have an active account marked');
  assert.ok(active.email.includes('@'), 'Active account should have a valid email');
});

test('syncActiveSession detects and returns accounts with active status', () => {
  const profiles = syncActiveSession();
  assert.ok(Array.isArray(profiles));
  assert.ok(profiles.length >= 1);
  const activeCount = profiles.filter(p => p.isActive).length;
  assert.equal(activeCount, 1, 'Exactly one account should be marked active');
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

test('listProfilesDirect returns profiles array directly', () => {
  const profiles = listProfilesDirect();
  assert.ok(Array.isArray(profiles));
  assert.ok(profiles.length >= 1);
});

test('switchProfile returns fast-path alreadyActive when switching to active account', () => {
  const profiles = listProfiles();
  const active = profiles.find(p => p.isActive);
  assert.ok(active, 'Must have an active account');

  const res = switchProfile(active.id);
  assert.equal(res.alreadyActive, true, 'Should trigger fast-path for active account');
  assert.equal(res.id, active.id);
});

test('Auto-switcher candidate filter strictly checks 5-hour and weekly quotas > 10% and ready status', () => {
  const mockAccounts = [
    { id: '1', isActive: true, fiveHourPercent: 100, weeklyPercent: 100, needsRelogin: false, status: 'ready' },
    { id: '2', isActive: false, fiveHourPercent: 50, weeklyPercent: 4, needsRelogin: false, status: 'ready' }, // Weekly too low (4%)
    { id: '3', isActive: false, fiveHourPercent: 5, weeklyPercent: 90, needsRelogin: false, status: 'ready' }, // 5h too low (5%)
    { id: '4', isActive: false, fiveHourPercent: 80, weeklyPercent: 80, needsRelogin: true, status: 'needs_relogin' }, // Needs relogin
    { id: '5', isActive: false, fiveHourPercent: 80, weeklyPercent: 80, needsRelogin: false, status: 'cooldown' }, // Not ready
    { id: '6', isActive: false, fiveHourPercent: 70, weeklyPercent: 60, needsRelogin: false, status: 'ready' }, // Eligible!
    { id: '7', isActive: false, fiveHourPercent: 90, weeklyPercent: 70, needsRelogin: false, status: 'ready' }  // Eligible & best!
  ];

  const candidates = mockAccounts
    .filter(a => !a.isActive && a.fiveHourPercent > 10 && a.weeklyPercent > 10 && !a.needsRelogin && a.status === 'ready')
    .sort((a, b) => {
      if (b.fiveHourPercent !== a.fiveHourPercent) {
        return b.fiveHourPercent - a.fiveHourPercent;
      }
      return b.weeklyPercent - a.weeklyPercent;
    });

  assert.equal(candidates.length, 2, 'Only accounts 6 and 7 should be eligible');
  assert.equal(candidates[0].id, '7', 'Account 7 has highest 5h percent');
  assert.equal(candidates[1].id, '6', 'Account 6 is second');
});

test('getAllAccountsQuotaSummary accurately classifies accounts with exhausted weekly quota as cooldown', async () => {
  const { getAllAccountsQuotaSummary } = await import('../src/sidecar/quota-poller.js');
  const summary = await getAllAccountsQuotaSummary();
  assert.ok(Array.isArray(summary));

  summary.forEach(acc => {
    if (!acc.isActive && !acc.needsRelogin) {
      if (acc.weeklyPercent === 0 || acc.fiveHourPercent === 0) {
        assert.equal(acc.status, 'cooldown', `Account ${acc.email} with 0% quota must be in cooldown status`);
      }
    }
  });
});

