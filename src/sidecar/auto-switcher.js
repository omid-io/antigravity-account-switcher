import { switchProfile } from './vault-manager.js';
import { getAllAccountsQuotaSummary } from './quota-poller.js';

export class AutoSwitcher {
  /**
   * @param {import('./cdp-bridge.js').CdpBridge} cdpBridge 
   */
  constructor(cdpBridge) {
    this.cdp = cdpBridge;
    this.isEnabled = false;
    this.lastTriggerTime = 0;
    this.cooldownMs = 15000; // 15 seconds debounce
    this.isSwitching = false;

    this.initListeners();
  }

  setEnabled(val) {
    this.isEnabled = !!val;
    console.log(`[auto-switcher] Auto-switch feature is now: ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  initListeners() {
    this.cdp.on('quota-exhausted', async (details) => {
      console.warn('[auto-switcher] Quota exhaustion detected via CDP:', details);
      if (!this.isEnabled) {
        console.log('[auto-switcher] Auto-switch is disabled by user. Ignoring event.');
        return;
      }

      await this.handleQuotaExhaustion();
    });
  }

  async handleQuotaExhaustion() {
    const now = Date.now();
    if (now - this.lastTriggerTime < this.cooldownMs || this.isSwitching) {
      return;
    }
    this.lastTriggerTime = now;
    this.isSwitching = true;

    try {
      console.log('[auto-switcher] Evaluating eligible candidate accounts...');
      const summary = await getAllAccountsQuotaSummary(this.cdp);
      
      // Filter candidate accounts that are not currently active and have quota
      const candidates = summary
        .filter(a => !a.isActive && a.remainingPercent > 5)
        .sort((a, b) => b.remainingPercent - a.remainingPercent);

      if (candidates.length === 0) {
        console.warn('[auto-switcher] No available backup accounts with remaining quota.');
        await this.showToast('All accounts have exhausted quota. Please wait for reset.');
        return;
      }

      const bestTarget = candidates[0];
      console.log(`[auto-switcher] Switching automatically to ${bestTarget.label} (${bestTarget.email}) with ${bestTarget.remainingPercent}% quota!`);

      await this.showToast(`Auto-switching to ${bestTarget.label} (${bestTarget.remainingPercent}% quota)...`);

      // Small pause so toast is visible
      await new Promise(r => setTimeout(r, 1000));

      switchProfile(bestTarget.id);
      await this.cdp.reloadWindow();
    } catch (err) {
      console.error('[auto-switcher] Error during auto-switch:', err.message);
    } finally {
      this.isSwitching = false;
    }
  }

  async showToast(message) {
    try {
      const expr = `(() => {
        const existing = document.getElementById('agy-switcher-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'agy-switcher-toast';
        toast.innerText = ${JSON.stringify(message)};
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:rgba(15,23,42,0.95);color:#38bdf8;padding:12px 20px;border-radius:10px;border:1px solid rgba(56,189,248,0.4);font-size:13px;font-weight:500;box-shadow:0 10px 30px rgba(0,0,0,0.5);z-index:999999;backdrop-filter:blur(8px);transition:all 0.3s ease;';
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '0', 3500);
        setTimeout(() => toast.remove(), 4000);
      })()`;
      await this.cdp.evaluate(expr, false);
    } catch {}
  }
}
