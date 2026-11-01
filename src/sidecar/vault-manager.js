import fs from 'fs';
import path from 'path';
import os from 'os';
import { readActiveCredential, writeActiveCredential } from './cred-manager.js';

const VAULT_DIR = path.join(os.homedir(), '.gemini', 'antigravity-switcher', 'vault');
const PROFILES_INDEX = path.join(VAULT_DIR, 'profiles.json');
const SESSIONS_DIR = path.join(VAULT_DIR, 'sessions');
const APP_STORAGE_PATH = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Antigravity', 'app_storage.json');

/**
 * Initializes the Vault directory and registers the current active account if empty.
 */
export function initVault() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  let index = [];
  if (fs.existsSync(PROFILES_INDEX)) {
    try {
      index = JSON.parse(fs.readFileSync(PROFILES_INDEX, 'utf8'));
    } catch {
      index = [];
    }
  }

  // If vault is completely empty, automatically capture current active account
  if (index.length === 0) {
    const cred = readActiveCredential();
    const activeEmail = cred?.id_token_email || getActiveEmailFromAppStorage() || 'primary@google.com';
    const initialId = 'acc_' + Date.now();
    const profile = {
      id: initialId,
      label: 'Main Account',
      email: activeEmail,
      plan: 'Pro',
      isActive: true,
      lastQuota: 1.0,
      resetTime: null,
      addedAt: new Date().toISOString()
    };
    
    if (cred) {
      fs.writeFileSync(path.join(SESSIONS_DIR, `${initialId}.json`), JSON.stringify(cred, null, 2), 'utf8');
    }
    index.push(profile);
    fs.writeFileSync(PROFILES_INDEX, JSON.stringify(index, null, 2), 'utf8');
  }

  return index;
}

/**
 * Reads user email from app_storage.json as fallback.
 */
function getActiveEmailFromAppStorage() {
  if (!fs.existsSync(APP_STORAGE_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(APP_STORAGE_PATH, 'utf8'));
    return data['jetski.onboarding.lastLoginUsername'] || null;
  } catch {
    return null;
  }
}

/**
 * Updates user email in app_storage.json upon switch.
 */
function updateAppStorageEmail(email) {
  if (!fs.existsSync(APP_STORAGE_PATH) || !email) return false;
  try {
    const data = JSON.parse(fs.readFileSync(APP_STORAGE_PATH, 'utf8'));
    data['jetski.onboarding.lastLoginUsername'] = email;
    fs.writeFileSync(APP_STORAGE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[vault-manager] Error updating app_storage.json:', err.message);
    return false;
  }
}

/**
 * Lists all profiles with their active state and quotas.
 */
export function listProfiles() {
  initVault();
  try {
    return JSON.parse(fs.readFileSync(PROFILES_INDEX, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Captures current active session into vault as a new profile or updates existing.
 */
export function snapshotCurrentSession(label) {
  initVault();
  const cred = readActiveCredential();
  if (!cred) {
    throw new Error('No active Google session found in Windows Credential Manager.');
  }

  const email = cred.id_token_email || getActiveEmailFromAppStorage() || 'account@google.com';
  let index = listProfiles();

  // Check if profile with this email already exists
  let profile = index.find(p => p.email.toLowerCase() === email.toLowerCase());
  const id = profile ? profile.id : 'acc_' + Date.now();

  if (!profile) {
    profile = {
      id,
      label: label || `Account ${index.length + 1}`,
      email,
      plan: 'Pro',
      isActive: true,
      lastQuota: 1.0,
      resetTime: null,
      addedAt: new Date().toISOString()
    };
    // Mark others as inactive
    index.forEach(p => p.isActive = false);
    index.push(profile);
  } else {
    if (label) profile.label = label;
    profile.isActive = true;
    index.forEach(p => { if (p.id !== id) p.isActive = false; });
  }

  fs.writeFileSync(path.join(SESSIONS_DIR, `${id}.json`), JSON.stringify(cred, null, 2), 'utf8');
  fs.writeFileSync(PROFILES_INDEX, JSON.stringify(index, null, 2), 'utf8');

  return profile;
}

/**
 * Updates profile metadata (e.g. quota, resetTime, plan).
 */
export function updateProfileQuota(email, quotaFraction, resetTime, planName, profilePictureUrl, name, weeklyQuota, weeklyResetTime, fiveHourDesc, weeklyDesc) {
  let index = listProfiles();
  let changed = false;

  for (const p of index) {
    if (p.email.toLowerCase() === email.toLowerCase()) {
      if (typeof quotaFraction === 'number') {
        p.lastQuota = quotaFraction;
        p.fiveHourQuota = quotaFraction;
      }
      if (resetTime !== undefined) {
        p.resetTime = resetTime;
        p.fiveHourResetTime = resetTime;
      }
      if (typeof weeklyQuota === 'number') {
        p.weeklyQuota = weeklyQuota;
      }
      if (weeklyResetTime !== undefined) {
        p.weeklyResetTime = weeklyResetTime;
      }
      if (fiveHourDesc !== undefined) {
        p.fiveHourDesc = fiveHourDesc;
      }
      if (weeklyDesc !== undefined) {
        p.weeklyDesc = weeklyDesc;
      }
      if (planName) p.plan = planName;
      if (profilePictureUrl) p.profilePictureUrl = profilePictureUrl;
      if (name) p.name = name;
      p.lastQuotaCheck = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(PROFILES_INDEX, JSON.stringify(index, null, 2), 'utf8');
  }
  return index;
}

/**
 * Performs atomic switch to target profile.
 * Writes credentials, updates app_storage, updates active flag.
 */
export function switchProfile(targetId) {
  initVault();
  let index = listProfiles();
  const targetProfile = index.find(p => p.id === targetId);

  if (!targetProfile) {
    throw new Error(`Profile ${targetId} not found in vault.`);
  }

  const sessionFile = path.join(SESSIONS_DIR, `${targetId}.json`);
  if (!fs.existsSync(sessionFile)) {
    throw new Error(`Session file for profile ${targetId} missing.`);
  }

  // 1. Snapshot current active session before switching
  const currentActive = index.find(p => p.isActive);
  if (currentActive) {
    const currentCred = readActiveCredential();
    if (currentCred) {
      fs.writeFileSync(path.join(SESSIONS_DIR, `${currentActive.id}.json`), JSON.stringify(currentCred, null, 2), 'utf8');
    }
  }

  // 2. Load target session
  const targetCred = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

  // 3. Write target session to Windows Credential Manager
  const written = writeActiveCredential(targetCred, 'antigravity');
  if (!written) {
    throw new Error('Failed to write target session to Windows Credential Manager.');
  }

  // 4. Update app_storage.json with new email
  updateAppStorageEmail(targetProfile.email);

  // 5. Update active status in profiles.json
  index.forEach(p => {
    p.isActive = (p.id === targetId);
  });
  fs.writeFileSync(PROFILES_INDEX, JSON.stringify(index, null, 2), 'utf8');

  console.log(`[vault-manager] Switched successfully to ${targetProfile.label} (${targetProfile.email})`);
  return targetProfile;
}

/**
 * Removes an account from the vault (cannot remove active account).
 */
export function removeProfile(id) {
  let index = listProfiles();
  const target = index.find(p => p.id === id);
  if (!target) return false;
  if (target.isActive) {
    throw new Error('Cannot delete currently active account. Switch to another account first.');
  }

  index = index.filter(p => p.id !== id);
  fs.writeFileSync(PROFILES_INDEX, JSON.stringify(index, null, 2), 'utf8');

  const sessionFile = path.join(SESSIONS_DIR, `${id}.json`);
  if (fs.existsSync(sessionFile)) {
    try { fs.unlinkSync(sessionFile); } catch {}
  }

  return true;
}
