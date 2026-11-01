#!/usr/bin/env node

import { listProfiles, switchProfile, snapshotCurrentSession } from '../src/sidecar/vault-manager.js';
import { getAllAccountsQuotaSummary } from '../src/sidecar/quota-poller.js';

const args = process.argv.slice(2);
const command = args[0] || 'start';

async function run() {
  switch (command) {
    case 'start':
      console.log('Starting Antigravity Account Switcher Sidecar...');
      await import('../src/sidecar/index.js');
      break;

    case 'list': {
      const accounts = await getAllAccountsQuotaSummary();
      console.log('\n=================== Antigravity Accounts ===================');
      console.table(accounts.map(a => ({
        ID: a.id,
        Label: a.label,
        Email: a.email,
        Plan: a.plan,
        'Quota %': a.remainingPercent + '%',
        Status: a.isActive ? 'ACTIVE' : a.status.toUpperCase(),
        Reset: a.resetCountdownText
      })));
      console.log('============================================================\n');
      process.exit(0);
      break;
    }

    case 'switch': {
      const target = args[1];
      if (!target) {
        console.error('Usage: antigravity-switcher switch <account-id-or-email>');
        process.exit(1);
      }
      const profiles = listProfiles();
      const match = profiles.find(p => p.id === target || p.email.toLowerCase() === target.toLowerCase());
      if (!match) {
        console.error(`Error: No account found matching "${target}"`);
        process.exit(1);
      }
      switchProfile(match.id);
      console.log(`Successfully switched active account to ${match.label} (${match.email})`);
      process.exit(0);
      break;
    }

    case 'snapshot': {
      const label = args[1] || 'Saved Account';
      const snap = snapshotCurrentSession(label);
      console.log(`Snapshot saved: ${snap.label} (${snap.email})`);
      process.exit(0);
      break;
    }

    case '--help':
    case '-h':
    case 'help':
    default:
      console.log(`
Antigravity Account Switcher CLI

Usage:
  antigravity-switcher start             Start background sidecar & in-app injector
  antigravity-switcher list              Display all registered accounts and live quotas
  antigravity-switcher switch <id/email> Switch active Google session
  antigravity-switcher snapshot [label]  Save current session into vault
  antigravity-switcher help              Show this help message
`);
      process.exit(0);
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
