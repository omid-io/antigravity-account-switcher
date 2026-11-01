import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PS1_PATH = path.join(__dirname, 'wincred.ps1');

const TARGET_NAME = 'LegacyGeneric:target=gemini:antigravity';

/**
 * Reads the active Antigravity OAuth session from Windows Credential Manager.
 * @returns {object|null} Parsed credential object or null
 */
export function readActiveCredential() {
  try {
    const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${PS1_PATH}" -Action read -Target "${TARGET_NAME}"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();

    if (!output) return null;
    const jsonStr = Buffer.from(output, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[cred-manager] Error reading active credential:', err.message);
    return null;
  }
}

/**
 * Writes an OAuth session into Windows Credential Manager for Antigravity.
 * @param {object|string} credentialObj - The session JSON object or string
 * @param {string} userName - The username/email associated with the credential
 * @returns {boolean} True if successfully written
 */
export function writeActiveCredential(credentialObj, userName = 'antigravity') {
  try {
    const rawJson = typeof credentialObj === 'string' ? credentialObj : JSON.stringify(credentialObj);
    const b64 = Buffer.from(rawJson, 'utf8').toString('base64');
    const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${PS1_PATH}" -Action write -Target "${TARGET_NAME}" -UserName "${userName}" -Base64Payload "${b64}"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();

    return output.toLowerCase().includes('true');
  } catch (err) {
    console.error('[cred-manager] Error writing active credential:', err.message);
    return false;
  }
}
