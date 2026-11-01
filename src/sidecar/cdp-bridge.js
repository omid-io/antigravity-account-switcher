import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

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
      console.error('[cdp-bridge] Error reading DevTools port:', e.message);
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
      const res = await fetch(`http://127.0.0.1:${this.port}/json/list`);
      if (!res.ok) return null;
      const targets = await res.json();
      // Target must be a page running on local host server or Antigravity shell
      return targets.find(t => t.type === 'page' && (t.url.includes('127.0.0.1') || t.title.includes('Antigravity')));
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

    const target = await this.findMainTarget();
    if (!target || !target.webSocketDebuggerUrl) {
      this.scheduleReconnect();
      return false;
    }

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(target.webSocketDebuggerUrl);

        this.ws.onopen = async () => {
          this.isConnected = true;
          this.pageUrl = target.url;
          console.log(`[cdp-bridge] Connected to Antigravity window: "${target.title}" (Port ${this.port})`);

          // Enable Console and Network domains to observe errors (like 429 quota exhaustion)
          this.send('Console.enable');
          this.send('Network.enable');

          this.emit('connected', target);
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle RPC response callbacks
            if (data.id && this.pendingCallbacks.has(data.id)) {
              const cb = this.pendingCallbacks.get(data.id);
              this.pendingCallbacks.delete(data.id);
              cb(data);
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
            console.error('[cdp-bridge] Error handling message:', e.message);
          }
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          console.log('[cdp-bridge] Connection closed. Reconnecting...');
          this.emit('disconnected');
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.error('[cdp-bridge] WebSocket error:', err.message || err);
          this.ws?.close();
        };
      } catch (err) {
        console.error('[cdp-bridge] Failed to initiate WebSocket:', err.message);
        this.scheduleReconnect();
        resolve(false);
      }
    });
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
   * Low-level send command.
   */
  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }

      this.pendingCallbacks.set(id, (res) => {
        if (res.error) {
          reject(new Error(res.error.message || JSON.stringify(res.error)));
        } else {
          resolve(res.result);
        }
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluates an expression inside the Antigravity window renderer.
   * @param {string} expression 
   * @param {boolean} awaitPromise 
   * @returns {Promise<any>} Evaluated value
   */
  async evaluate(expression, awaitPromise = true) {
    if (!this.isConnected) {
      await this.connect();
    }
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    });
    return result?.result?.value;
  }

  /**
   * Soft reloads the Antigravity renderer window.
   */
  async reloadWindow() {
    console.log('[cdp-bridge] Reloading Antigravity window...');
    try {
      await this.evaluate('window.location.reload()', false);
      return true;
    } catch {
      // In case evaluation fails due to immediate navigation, send Page.reload
      try {
        await this.send('Page.reload', { ignoreCache: true });
        return true;
      } catch (e) {
        console.error('[cdp-bridge] Error during reload:', e.message);
        return false;
      }
    }
  }
}
