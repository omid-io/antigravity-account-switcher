import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.gemini', 'antigravity-switcher');
const LOG_FILE = path.join(LOG_DIR, 'switcher.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Rotates log file if it exceeds MAX_LOG_SIZE.
 */
function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = path.join(LOG_DIR, 'switcher.log.old');
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(LOG_FILE, backupFile);
      }
    }
  } catch {}
}

/**
 * Appends a log line with ISO timestamp and level.
 * @param {'INFO'|'WARN'|'ERROR'|'DEBUG'} level 
 * @param {string} tag 
 * @param {string} message 
 * @param {any} [meta] 
 */
export function log(level, tag, message, meta = null) {
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] [${tag}] ${message}`;
  if (meta !== null && meta !== undefined) {
    if (meta instanceof Error) {
      line += ` | Error: ${meta.message}\n${meta.stack}`;
    } else if (typeof meta === 'object') {
      try {
        line += ` | Data: ${JSON.stringify(meta)}`;
      } catch {
        line += ` | Data: [Unserializable Object]`;
      }
    } else {
      line += ` | ${meta}`;
    }
  }
  line += '\n';

  // Also output to console
  const consolePrefix = `[${level}] [${tag}]`;
  if (level === 'ERROR') {
    console.error(consolePrefix, message, meta || '');
  } else if (level === 'WARN') {
    console.warn(consolePrefix, message, meta || '');
  } else {
    console.log(consolePrefix, message, meta || '');
  }

  try {
    ensureLogDir();
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {}
}

export const logger = {
  info: (tag, msg, meta) => log('INFO', tag, msg, meta),
  warn: (tag, msg, meta) => log('WARN', tag, msg, meta),
  error: (tag, msg, meta) => log('ERROR', tag, msg, meta),
  debug: (tag, msg, meta) => log('DEBUG', tag, msg, meta),

  /**
   * Reads recent log lines for debugging.
   * @param {number} maxLines 
   * @returns {string[]}
   */
  getRecentLogs(maxLines = 150) {
    if (!fs.existsSync(LOG_FILE)) return [];
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.trim().split('\n');
      return lines.slice(-maxLines);
    } catch (e) {
      return [`[ERROR] Failed to read log file: ${e.message}`];
    }
  },

  getLogFilePath() {
    return LOG_FILE;
  }
};
