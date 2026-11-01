#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { listProfiles, switchProfile, snapshotCurrentSession } from '../src/sidecar/vault-manager.js';
import { getAllAccountsQuotaSummary } from '../src/sidecar/quota-poller.js';
import { checkForUpdates } from '../src/sidecar/update-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function run() {
  switch (command) {
    case 'start':
      console.log('🚀 Starting Antigravity Account Switcher Sidecar...');
      await import('../src/sidecar/index.js');
      break;

    case 'install': {
      console.log('📦 Installing Antigravity Account Switcher as native plugin...');
      await import('../scripts/install-plugin.js');
      break;
    }

    case 'update': {
      console.log('⚡ Updating Antigravity Account Switcher to latest version...');
      await import('../scripts/install-plugin.js');
      console.log('✅ Update applied successfully! Live hot-reload triggered.');
      process.exit(0);
      break;
    }

    case 'uninstall': {
      console.log('🗑️ Uninstalling Antigravity Account Switcher plugin...');
      await import('../scripts/uninstall-plugin.js');
      break;
    }

    case 'status': {
      console.log('\n=================== Antigravity Switcher Status ===================');
      try {
        const updateInfo = await checkForUpdates(true);
        console.log(`Version:        v${updateInfo.currentVersion}`);
        if (updateInfo.hasUpdate) {
          console.log(`📢 Update:      v${updateInfo.latestVersion} AVAILABLE! (Run: ${updateInfo.updateCommand})`);
        } else {
          console.log(`Latest Release: Up-to-date (v${updateInfo.latestVersion})`);
        }
      } catch {}

      // Test local sidecar connection
      let sidecarOnline = false;
      try {
        const res = await fetch('http://127.0.0.1:51444/api/accounts', { signal: AbortSignal.timeout(1500) });
        if (res.ok) sidecarOnline = true;
      } catch {}

      console.log(`Sidecar Server: ${sidecarOnline ? '🟢 ONLINE (Port 51444)' : '⚪ OFFLINE'}`);

      const profiles = listProfiles();
      console.log(`Vault Accounts: ${profiles.length} registered`);
      const active = profiles.find(p => p.isActive);
      if (active) {
        console.log(`Active Account: ${active.label} (${active.email}) [${active.plan || 'Pro'}]`);
      }
      console.log('===================================================================\n');
      process.exit(0);
      break;
    }

    case 'check-update': {
      console.log('🔍 Checking for latest releases...');
      const info = await checkForUpdates(true);
      console.log(`Current version: v${info.currentVersion}`);
      console.log(`Latest version:  v${info.latestVersion}`);
      if (info.hasUpdate) {
        console.log(`\n🎉 New update available: v${info.latestVersion}`);
        console.log(`Run: ${info.updateCommand}\n`);
      } else {
        console.log('\n✅ You are running the latest version.\n');
      }
      process.exit(0);
      break;
    }

    case 'list': {
      const accounts = await getAllAccountsQuotaSummary();
      console.log('\n=================== Antigravity Accounts ===================');
      console.table(accounts.map(a => ({
        ID: a.id,
        Label: a.label,
        Email: a.email,
        Plan: a.plan,
        '5-Hour %': (a.fiveHourPercent !== undefined ? a.fiveHourPercent : a.remainingPercent) + '%',
        'Weekly %': (a.weeklyPercent !== undefined ? a.weeklyPercent : 100) + '%',
        Status: a.isActive ? 'ACTIVE' : a.status.toUpperCase(),
        Reset: a.fiveHourCountdownText || a.resetCountdownText
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
  npx antigravity-account-switcher install       Install plugin into Antigravity
  npx antigravity-account-switcher update        Update plugin & hot-reload running app
  npx antigravity-account-switcher status        Check daemon status & quota updates
  npx antigravity-account-switcher check-update  Check if newer version exists
  npx antigravity-account-switcher list          Display registered accounts and quotas
  npx antigravity-account-switcher switch <id>   Switch active Google account
  npx antigravity-account-switcher start         Start background sidecar server
  npx antigravity-account-switcher uninstall     Uninstall plugin from Antigravity
`);
      process.exit(0);
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
