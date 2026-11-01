import fs from 'fs';
import path from 'path';
import os from 'os';

const PLUGIN_NAME = 'antigravity-account-switcher';
const PLUGINS_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins');
const TARGET_DIR = path.join(PLUGINS_DIR, PLUGIN_NAME);

async function uninstall() {
  console.log(`Uninstalling ${PLUGIN_NAME}...`);
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
    console.log('✅ Antigravity Account Switcher plugin removed successfully.');
  } else {
    console.log('Plugin was not installed in ~/.gemini/config/plugins.');
  }
}

uninstall().catch(err => {
  console.error('Uninstall failed:', err.message);
  process.exit(1);
});
