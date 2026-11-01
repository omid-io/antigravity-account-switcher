/**
 * Client-side UI Engine for Antigravity Multi-Account Switcher.
 * Injected into the Antigravity desktop renderer window.
 */
(function() {
  if (window.__AGY_SWITCHER_LOADED__) return;
  window.__AGY_SWITCHER_LOADED__ = true;

  const API_BASE = 'http://127.0.0.1:51444';
  let isAutoSwitchActive = false;
  let cachedAccounts = [];

  // 1. Inject Styles
  function injectStyles(cssText) {
    if (document.getElementById('agy-switcher-styles')) return;
    const style = document.createElement('style');
    style.id = 'agy-switcher-styles';
    style.textContent = cssText;
    document.head.appendChild(style);
  }

  // 2. Inject Sidebar Button
  function injectSidebarButton() {
    if (document.getElementById('agy-switcher-sidebar-btn')) return;

    // Find the bottom container holding Settings
    const settingsBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.getAttribute('data-testid') === 'settings-button' || b.innerText.trim().includes('Settings')
    );

    if (!settingsBtn || !settingsBtn.parentElement) {
      setTimeout(injectSidebarButton, 1000);
      return;
    }

    const container = settingsBtn.parentElement;

    const btn = document.createElement('button');
    btn.id = 'agy-switcher-sidebar-btn';
    btn.className = 'agy-switcher-sidebar-btn';
    btn.title = 'Switch Account & Live Quota';

    btn.innerHTML = `
      <span class="shrink-0 flex items-center" style="color:#38bdf8;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <polyline points="16 11 18 13 22 9"></polyline>
        </svg>
      </span>
      <span class="truncate text-sm" style="font-weight:500;">Accounts</span>
      <span id="agy-sidebar-quota-pill" class="agy-sidebar-quota-pill">...</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });

    // Insert above settings
    container.insertBefore(btn, settingsBtn);
  }

  // 3. Inject Modal DOM Structure
  function injectModalStructure() {
    if (document.getElementById('agy-account-switcher-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'agy-account-switcher-overlay';

    overlay.innerHTML = `
      <div id="agy-account-switcher-modal">
        <!-- Header -->
        <div class="agy-modal-header">
          <div class="agy-modal-title-group">
            <div class="agy-modal-icon-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div>
              <h3 class="agy-modal-title">Antigravity Account Switcher</h3>
              <div class="agy-modal-subtitle">1-Click Multi-Account & Live Quota Switcher</div>
            </div>
          </div>
          <button id="agy-modal-close" class="agy-modal-close-btn" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Controls Toolbar -->
        <div class="agy-modal-toolbar">
          <button id="agy-refresh-btn" class="agy-toolbar-refresh-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Refresh Quotas</span>
          </button>

          <div id="agy-auto-switch-container" class="agy-auto-switch-toggle">
            <span>Auto-Switch on Exhaustion</span>
            <div id="agy-switch-track" class="agy-switch-track">
              <div class="agy-switch-thumb"></div>
            </div>
          </div>
        </div>

        <!-- Accounts List Container -->
        <div id="agy-accounts-body" class="agy-modal-body">
          <div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px;">Loading accounts...</div>
        </div>

        <!-- Footer -->
        <div class="agy-modal-footer">
          <button id="agy-add-account-btn" class="agy-add-account-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Account</span>
          </button>
          <div class="agy-footer-info">v1.0.0 · Human-Safe Session Vault</div>
        </div>

        <!-- Confirmation Dialog (Hidden initially) -->
        <div id="agy-confirm-dialog" style="display:none;">
          <div class="agy-confirm-box">
            <h4 class="agy-confirm-title">Switch Google Account?</h4>
            <p id="agy-confirm-text" class="agy-confirm-text">Are you sure you want to switch accounts?</p>
            <div class="agy-confirm-actions">
              <button id="agy-confirm-cancel" class="agy-cancel-btn">Cancel</button>
              <button id="agy-confirm-proceed" class="agy-confirm-btn">Confirm Switch</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('agy-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.getElementById('agy-refresh-btn').addEventListener('click', onRefreshClick);
    document.getElementById('agy-auto-switch-container').addEventListener('click', onToggleAutoSwitch);
    document.getElementById('agy-add-account-btn').addEventListener('click', onAddAccountClick);
  }

  // 4. Modal Open & Close
  async function openModal() {
    const overlay = document.getElementById('agy-account-switcher-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    // On open, refresh accounts automatically as agreed
    await fetchAndRenderAccounts(true);
  }

  function closeModal() {
    const overlay = document.getElementById('agy-account-switcher-overlay');
    if (overlay) overlay.classList.remove('open');
    hideConfirm();
  }

  // 5. Fetch & Render Accounts
  async function fetchAndRenderAccounts(isRefresh = false) {
    const refreshBtn = document.getElementById('agy-refresh-btn');
    if (isRefresh && refreshBtn) refreshBtn.classList.add('spinning');

    try {
      const url = isRefresh ? `${API_BASE}/api/refresh` : `${API_BASE}/api/accounts`;
      const res = await fetch(url, { method: isRefresh ? 'POST' : 'GET' });
      const data = await res.json();

      cachedAccounts = data.accounts || [];
      isAutoSwitchActive = !!data.autoSwitch;

      updateAutoSwitchUI(isAutoSwitchActive);
      renderAccountCards(cachedAccounts);
      updateSidebarQuotaPill(cachedAccounts);
    } catch (err) {
      console.error('[agy-switcher] Error loading accounts:', err);
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  function updateSidebarQuotaPill(accounts) {
    const active = accounts.find(a => a.isActive);
    const pill = document.getElementById('agy-sidebar-quota-pill');
    if (pill && active) {
      pill.innerText = `${active.remainingPercent}%`;
      pill.style.color = active.remainingPercent > 50 ? '#34d399' : (active.remainingPercent > 20 ? '#fbbf24' : '#f87171');
      pill.style.borderColor = active.remainingPercent > 50 ? 'rgba(16, 185, 129, 0.4)' : (active.remainingPercent > 20 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)');
    }
  }

  function updateAutoSwitchUI(active) {
    const track = document.getElementById('agy-switch-track');
    if (track) {
      if (active) track.classList.add('active');
      else track.classList.remove('active');
    }
  }

  function renderAccountCards(accounts) {
    const body = document.getElementById('agy-accounts-body');
    if (!body) return;

    if (!accounts || accounts.length === 0) {
      body.innerHTML = `<div style="text-align:center;padding:24px;color:#94a3b8;">No profiles registered in vault. Click "Add Account" to onboard.</div>`;
      return;
    }

    body.innerHTML = accounts.map(acc => {
      const quotaLevel = acc.remainingPercent > 50 ? 'high' : (acc.remainingPercent > 20 ? 'med' : 'low');
      const initials = (acc.email || 'A').slice(0, 2).toUpperCase();

      return `
        <div class="agy-account-card ${acc.isActive ? 'active' : ''}">
          <div class="agy-card-top">
            <div class="agy-card-user-info">
              <div class="agy-card-avatar">${initials}</div>
              <div class="agy-card-names">
                <div class="agy-card-label">
                  <span>${acc.label}</span>
                  <span class="agy-plan-badge">${acc.plan || 'PRO'}</span>
                </div>
                <div class="agy-card-email">${acc.email}</div>
              </div>
            </div>
            <div class="agy-card-actions">
              <span class="agy-status-pill ${acc.status}">${acc.status}</span>
              ${acc.isActive 
                ? `<button class="agy-card-switch-btn" disabled>Active</button>` 
                : `<button class="agy-card-switch-btn" onclick="window.__AGY_SWITCHER__.requestSwitch('${acc.id}', '${acc.label}', '${acc.email}')">Switch</button>`
              }
            </div>
          </div>

          <div class="agy-card-quota-row">
            <div class="agy-quota-labels">
              <span class="agy-quota-percent ${quotaLevel}">${acc.remainingPercent}% Quota Available</span>
              <span class="agy-quota-timer">${acc.resetCountdownText || ''}</span>
            </div>
            <div class="agy-quota-track">
              <div class="agy-quota-fill ${quotaLevel}" style="width: ${acc.remainingPercent}%;"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Action Handlers
  async function onRefreshClick() {
    await fetchAndRenderAccounts(true);
  }

  async function onToggleAutoSwitch() {
    const newState = !isAutoSwitchActive;
    try {
      const res = await fetch(`${API_BASE}/api/toggle-auto-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState })
      });
      const data = await res.json();
      isAutoSwitchActive = !!data.autoSwitch;
      updateAutoSwitchUI(isAutoSwitchActive);
    } catch (err) {
      console.error('[agy-switcher] Error toggling auto-switch:', err);
    }
  }

  function showConfirm(accId, label, email) {
    const dialog = document.getElementById('agy-confirm-dialog');
    const text = document.getElementById('agy-confirm-text');
    const proceedBtn = document.getElementById('agy-confirm-proceed');
    const cancelBtn = document.getElementById('agy-confirm-cancel');

    if (!dialog || !text) return;

    text.innerHTML = `Switch session to <strong>${label}</strong> (<em>${email}</em>)?<br><span style="font-size:11px;color:#94a3b8;display:block;margin-top:6px;">Your active chats, projects and code history will remain 100% safe.</span>`;
    dialog.style.display = 'flex';

    cancelBtn.onclick = hideConfirm;
    proceedBtn.onclick = async () => {
      proceedBtn.innerText = 'Switching...';
      proceedBtn.disabled = true;
      try {
        await fetch(`${API_BASE}/api/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: accId })
        });
        // The sidecar will trigger soft reload automatically
      } catch (e) {
        alert('Switch failed: ' + e.message);
        hideConfirm();
      }
    };
  }

  function hideConfirm() {
    const dialog = document.getElementById('agy-confirm-dialog');
    const proceedBtn = document.getElementById('agy-confirm-proceed');
    if (dialog) dialog.style.display = 'none';
    if (proceedBtn) {
      proceedBtn.innerText = 'Confirm Switch';
      proceedBtn.disabled = false;
    }
  }

  async function onAddAccountClick() {
    const btn = document.getElementById('agy-add-account-btn');
    if (btn) btn.innerHTML = `<span>Preparing Login...</span>`;

    try {
      const res = await fetch(`${API_BASE}/api/add-account`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        closeModal();
      }
    } catch (err) {
      alert('Failed to initiate login: ' + err.message);
    } finally {
      if (btn) btn.innerHTML = `<span>Add Account</span>`;
    }
  }

  // 7. Expose Global Switcher Hook
  window.__AGY_SWITCHER__ = {
    init: function(css) {
      injectStyles(css);
      injectSidebarButton();
      injectModalStructure();
      fetchAndRenderAccounts(false);
      setInterval(injectSidebarButton, 2000); // Guard against DOM re-renders
    },
    openModal,
    closeModal,
    requestSwitch: showConfirm,
    refresh: fetchAndRenderAccounts
  };

})();
