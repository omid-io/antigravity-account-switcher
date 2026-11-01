import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PLUGIN_NAME = 'antigravity-account-switcher';
const PLUGINS_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins');
const TARGET_DIR = path.join(PLUGINS_DIR, PLUGIN_NAME);

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function install() {
  console.log(`Installing ${PLUGIN_NAME} into Antigravity plugins directory...`);
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }

  // Remove existing installation if present
  if (fs.existsSync(TARGET_DIR)) {
    console.log(`Updating existing installation at: ${TARGET_DIR}`);
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }

  // Copy files to plugins directory
  copyDirRecursive(ROOT_DIR, TARGET_DIR);

  console.log('✅ Antigravity Account Switcher successfully installed as an official Antigravity plugin!');
  console.log(`Location: ${TARGET_DIR}`);
  console.log('Restart Antigravity or start the sidecar using: npm start');
}

install().catch(err => {
  console.error('Install failed:', err.message);
  process.exit(1);
});
