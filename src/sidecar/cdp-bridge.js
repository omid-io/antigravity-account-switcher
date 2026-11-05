import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { logger } from './logger.js';

const DEVTOOLS_PORT_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'Antigravity',
  'DevToolsActivePort'
);

export class CdpBridge extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.port = null;
    this.pageUrl = null;
    this.msgId = 1;
    this.pendingCallbacks = new Map();
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectTimer = null;
  }

  /**
   * Reads DevToolsActivePort file to get the active DevTools port.
   */
  getDevToolsPort() {
    if (!fs.existsSync(DEVTOOLS_PORT_PATH)) return null;
    try {
      const content = fs.readFileSync(DEVTOOLS_PORT_PATH, 'utf8').trim().split('\n');
      const port = parseInt(content[0], 10);
      return isNaN(port) ? null : port;
    } catch (e) {
      logger.error('cdp-bridge', 'Error reading DevTools port', e);
      return null;
    }
  }

  /**
   * Finds the main Antigravity window target.
   */
  async findMainTarget() {
    this.port = this.getDevToolsPort();
    if (!this.port) return null;

    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json/list`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) return null;
      const targets = await res.json();
      // Target must be a page running on local host server or Antigravity shell
      return targets.find(t => t.type === 'page' && (t.url?.includes('127.0.0.1') || t.title?.includes('Antigravity')));
    } catch {
      return null;
    }
  }

  /**
   * Connects to the main renderer via WebSocket.
   */
  async connect() {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      return true;
    }
    if (this.isConnecting) {
      return false;
    }
    this.isConnecting = true;

    try {
      const target = await this.findMainTarget();
      if (!target || !target.webSocketDebuggerUrl) {
        this.scheduleReconnect();
        return false;
      }

      return await new Promise((resolve) => {
        let settled = false;
        const connectTimeout = setTimeout(() => {
          logger.warn('cdp-bridge', 'WebSocket connection handshake timed out after 6000ms');
          try { this.ws?.close(); } catch {}
          done(false);
        }, 6000);

        const done = (val) => {
          if (!settled) {
            settled = true;
            clearTimeout(connectTimeout);
            resolve(val);
          }
        };

        try {
          this.ws = new WebSocket(target.webSocketDebuggerUrl);

          this.ws.onopen = async () => {
            this.isConnected = true;
            this.pageUrl = target.url;
            logger.info('cdp-bridge', `Connected to Antigravity window: "${target.title}" (Port ${this.port})`);

            // Enable Console, Network and Page domains to observe errors and reloads
            this.send('Console.enable').catch(() => {});
            this.send('Network.enable').catch(() => {});
            this.send('Page.enable').catch(() => {});

            this.emit('connected', target);
            done(true);
          };

          this.ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              // Handle RPC response callbacks
              if (data.id && this.pendingCallbacks.has(data.id)) {
                const entry = this.pendingCallbacks.get(data.id);
                this.pendingCallbacks.delete(data.id);
                if (entry.timer) clearTimeout(entry.timer);
                entry.callback(data);
                return;
              }

              // Handle Console API messages
              if (data.method === 'Console.messageAdded') {
                this.emit('console', data.params?.message);
                this.checkConsoleForQuotaError(data.params?.message);
              }

              // Handle Network response received
              if (data.method === 'Network.responseReceived') {
                const resp = data.params?.response;
                if (resp?.status === 429) {
                  this.emit('quota-exhausted', { source: 'network', status: 429, url: resp.url });
                }
              }

              this.emit('event', data);
            } catch (e) {
              logger.error('cdp-bridge', 'Error handling incoming message', e);
            }
          };

          this.ws.onclose = () => {
            this.isConnected = false;
            logger.warn('cdp-bridge', 'WebSocket connection closed. Rejecting lingering callbacks.');
            this.flushPendingCallbacks('WebSocket closed before response received');
            this.emit('disconnected');
            this.scheduleReconnect();
            done(false);
          };

          this.ws.onerror = (err) => {
            logger.error('cdp-bridge', 'WebSocket error', err?.message || err);
            done(false);
            this.ws?.close();
          };
        } catch (err) {
          logger.error('cdp-bridge', 'Failed to initiate WebSocket connection', err);
          this.scheduleReconnect();
          done(false);
        }
      });
    } finally {
      this.isConnecting = false;
    }
  }

  flushPendingCallbacks(reason) {
    for (const [id, entry] of this.pendingCallbacks.entries()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.callback({ error: { message: reason } });
    }
    this.pendingCallbacks.clear();
  }

  checkConsoleForQuotaError(msg) {
    if (!msg || !msg.text) return;
    const text = msg.text.toLowerCase();
    if (text.includes('429') || text.includes('quota exceeded') || text.includes('resource_exhausted')) {
      this.emit('quota-exhausted', { source: 'console', text: msg.text });
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, 2000);
  }

  /**
   * Low-level send command with strict timeout.
   */
  send(method, params = {}, timeoutMs = 8000) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }

      const timer = setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error(`CDP command timed out after ${timeoutMs}ms: ${method}`));
        }
      }, timeoutMs);

      this.pendingCallbacks.set(id, {
        timer,
        callback: (res) => {
          if (res.error) {
            reject(new Error(res.error.message || JSON.stringify(res.error)));
          } else {
            resolve(res.result);
          }
        }
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluates an expression inside the Antigravity window renderer.
   * @param {string} expression 
   * @param {boolean} awaitPromise 
   * @param {number} timeoutMs
   * @returns {Promise<any>} Evaluated value
   */
  async evaluate(expression, awaitPromise = true, timeoutMs = 8000) {
    if (!this.isConnected) {
      await this.connect();
    }
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    }, timeoutMs);
    return result?.result?.value;
  }

  /**
   * Soft reloads the Antigravity renderer window.
   */
  async reloadWindow() {
    logger.info('cdp-bridge', 'Triggering Antigravity window reload...');
    try {
      await this.evaluate('window.location.reload()', false, 3000);
      return true;
    } catch {
      // In case evaluation fails due to immediate navigation, send Page.reload
      try {
        await this.send('Page.reload', { ignoreCache: true }, 3000);
        return true;
      } catch (e) {
        logger.error('cdp-bridge', 'Error during reload', e);
        return false;
      }
    }
  }
}
