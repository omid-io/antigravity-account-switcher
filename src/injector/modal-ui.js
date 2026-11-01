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
  let isPopoverOpen = false;

  // 1. Inject Styles
  function injectStyles(cssText) {
    let style = document.getElementById('agy-switcher-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'agy-switcher-styles';
      document.head.appendChild(style);
    }
    style.textContent = cssText;
  }

  // 2. Cleanup legacy wrappers or buttons if present
  function cleanupLegacy() {
    const legacyBtn = document.getElementById('agy-switcher-sidebar-btn');
    if (legacyBtn) legacyBtn.remove();

    const rowWrapper = document.getElementById('agy-settings-row-wrapper');
    if (rowWrapper && rowWrapper.parentElement) {
      const container = rowWrapper.parentElement;
      const settingsBtn = rowWrapper.querySelector('button[data-testid="settings-button"]');
      if (settingsBtn) {
        container.insertBefore(settingsBtn, rowWrapper);
      }
      rowWrapper.remove();
    }
  }

  // 3. Inject ONLY the Circular Google Pro Avatar Button opposite Settings
  function injectAvatarTriggerButton() {
    cleanupLegacy();

    const settingsBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.getAttribute('data-testid') === 'settings-button' || (b.innerText && b.innerText.trim() === 'Settings')
    );

    if (!settingsBtn || !settingsBtn.parentElement) {
      return;
    }

    const container = settingsBtn.parentElement;
    container.style.position = 'relative';

    // If avatar button is already securely mounted inside the container, do not touch DOM
    const existingAvatar = document.getElementById('agy-avatar-trigger-btn');
    if (existingAvatar && existingAvatar.parentElement === container) {
      return;
    }

    // Create Circular Google Pro Avatar Button
    const avatarBtn = existingAvatar || document.createElement('button');
    avatarBtn.id = 'agy-avatar-trigger-btn';
    avatarBtn.title = 'Google Account & Live Quotas';

    if (!existingAvatar) {
      avatarBtn.innerHTML = `
        <div class="agy-avatar-inner-ring">
          <img id="agy-avatar-img" class="agy-avatar-img" src="" alt="Google Profile" style="display:none;" />
          <div id="agy-avatar-fallback" class="agy-avatar-fallback">G</div>
        </div>
        <div id="agy-avatar-quota-dot" class="agy-avatar-quota-dot" title="Live Quota"></div>
      `;

      avatarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePopover();
      });
    }

    container.appendChild(avatarBtn);
  }

  // 4. Inject Flyout Popover Structure (Soft Light)
  function injectPopoverStructure() {
    if (document.getElementById('agy-account-switcher-popover')) return;

    const popover = document.createElement('div');
    popover.id = 'agy-account-switcher-popover';

    popover.innerHTML = `
      <!-- Header -->
      <div class="agy-popover-header">
        <div class="agy-popover-header-left">
          <div class="agy-popover-avatar-preview">
            <img id="agy-header-avatar" src="" alt="Avatar" />
          </div>
          <div>
            <div id="agy-header-title" class="agy-popover-header-title">Google Account</div>
            <div id="agy-header-email" class="agy-popover-header-email">Loading...</div>
          </div>
        </div>
        <button id="agy-popover-close" class="agy-popover-close-btn" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Controls Toolbar -->
      <div class="agy-popover-toolbar">
        <button id="agy-refresh-btn" class="agy-toolbar-refresh-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span>Refresh</span>
        </button>

        <div id="agy-auto-switch-container" class="agy-auto-switch-toggle" title="Auto-switch when active quota exhausts">
          <span>Auto-Switch</span>
          <div id="agy-switch-track" class="agy-switch-track">
            <div class="agy-switch-thumb"></div>
          </div>
        </div>
      </div>

      <!-- Accounts List Container -->
      <div id="agy-accounts-body" class="agy-popover-body">
        <div style="text-align:center;padding:24px;color:#94a3b8;font-size:12px;">Loading accounts...</div>
      </div>

      <!-- Footer -->
      <div class="agy-popover-footer">
        <button id="agy-add-account-btn" class="agy-add-account-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Account</span>
        </button>
        <div class="agy-footer-info">Antigravity Switcher v1.1</div>
      </div>

      <!-- Confirmation Dialog (Soft Light) -->
      <div id="agy-confirm-dialog" style="display:none;">
        <div class="agy-confirm-box">
          <h4 class="agy-confirm-title">Switch Account?</h4>
          <p id="agy-confirm-text" class="agy-confirm-text">Switch active Google account?</p>
          <div class="agy-confirm-actions">
            <button id="agy-confirm-cancel" class="agy-cancel-btn">Cancel</button>
            <button id="agy-confirm-proceed" class="agy-confirm-btn">Confirm Switch</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popover);

    // Event listeners
    document.getElementById('agy-popover-close').addEventListener('click', closePopover);
    document.getElementById('agy-refresh-btn').addEventListener('click', onRefreshClick);
    document.getElementById('agy-auto-switch-container').addEventListener('click', onToggleAutoSwitch);
    document.getElementById('agy-add-account-btn').addEventListener('click', onAddAccountClick);

    // Click outside to close popover
    document.addEventListener('click', (e) => {
      if (!isPopoverOpen) return;
      const target = e.target;
      const trigger = document.getElementById('agy-avatar-trigger-btn');
      if (popover.contains(target) || (trigger && trigger.contains(target))) {
        return;
      }
      closePopover();
    });
  }

  // 5. Popover Open, Close, Toggle
  async function togglePopover() {
    if (isPopoverOpen) {
      closePopover();
    } else {
      await openPopover();
    }
  }

  async function openPopover() {
    const popover = document.getElementById('agy-account-switcher-popover');
    const trigger = document.getElementById('agy-avatar-trigger-btn');
    if (!popover) return;

    // Calculate position adjacent to the sidebar
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const sidebar = document.querySelector('[role="navigation"][aria-label="Sidebar"]') || trigger.closest('[role="navigation"]');
      const sidebarRight = sidebar ? sidebar.getBoundingClientRect().right : rect.right;
      popover.style.left = (sidebarRight + 10) + 'px';
      popover.style.bottom = Math.max(12, window.innerHeight - rect.bottom - 4) + 'px';
    }

    popover.classList.add('open');
    isPopoverOpen = true;

    // Refresh accounts on open
    await fetchAndRenderAccounts(true);
  }

  function closePopover() {
    const popover = document.getElementById('agy-account-switcher-popover');
    if (popover) popover.classList.remove('open');
    isPopoverOpen = false;
    hideConfirm();
  }

  // 6. Fetch & Render Accounts
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
      updateTriggerAvatar(cachedAccounts);
    } catch (err) {
      console.error('[agy-switcher] Error loading accounts:', err);
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  function updateTriggerAvatar(accounts) {
    const active = accounts.find(a => a.isActive);
    if (!active) return;

    const img = document.getElementById('agy-avatar-img');
    const fallback = document.getElementById('agy-avatar-fallback');
    const dot = document.getElementById('agy-avatar-quota-dot');
    const headerAvatar = document.getElementById('agy-header-avatar');
    const headerTitle = document.getElementById('agy-header-title');
    const headerEmail = document.getElementById('agy-header-email');

    if (active.profilePictureUrl && img) {
      img.src = active.profilePictureUrl;
      img.style.display = 'block';
      if (fallback) fallback.style.display = 'none';
      if (headerAvatar) headerAvatar.src = active.profilePictureUrl;
    } else if (fallback) {
      fallback.innerText = (active.name || active.email || 'G').slice(0, 1).toUpperCase();
      fallback.style.display = 'flex';
      if (img) img.style.display = 'none';
    }

    if (headerTitle) headerTitle.innerText = active.name || active.label || 'Active Account';
    if (headerEmail) headerEmail.innerText = active.email;

    if (dot) {
      dot.className = 'agy-avatar-quota-dot';
      if (active.remainingPercent <= 20) dot.classList.add('low');
      else if (active.remainingPercent <= 50) dot.classList.add('med');
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
      body.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">No accounts found. Click "Add Account" below.</div>`;
      return;
    }

    body.innerHTML = accounts.map(acc => {
      const quotaLevel = acc.remainingPercent > 50 ? 'high' : (acc.remainingPercent > 20 ? 'med' : 'low');
      const initials = (acc.name || acc.email || 'A').slice(0, 1).toUpperCase();
      const avatarHtml = acc.profilePictureUrl 
        ? `<img src="${acc.profilePictureUrl}" alt="Avatar" />` 
        : `<span>${initials}</span>`;

      return `
        <div class="agy-account-card ${acc.isActive ? 'active' : ''}">
          <div class="agy-card-top">
            <div class="agy-card-user-info">
              <div class="agy-card-avatar">${avatarHtml}</div>
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
              <span class="agy-quota-percent ${quotaLevel}">${acc.remainingPercent}% Available</span>
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

  // 7. Action Handlers
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

    text.innerHTML = `Switch active Google account to <strong>${label}</strong> (<em>${email}</em>)?<br><span style="font-size:11px;color:#64748b;display:block;margin-top:6px;">All active chats and projects remain safe.</span>`;
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
    if (btn) btn.innerHTML = `<span>Opening Login...</span>`;

    try {
      const res = await fetch(`${API_BASE}/api/add-account`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        closePopover();
      }
    } catch (err) {
      alert('Failed to initiate login: ' + err.message);
    } finally {
      if (btn) btn.innerHTML = `<span>Add Account</span>`;
    }
  }

  // 8. Global Hook
  window.__AGY_SWITCHER__ = {
    init: function(css) {
      injectStyles(css);
      cleanupLegacy();
      injectAvatarTriggerButton();
      injectPopoverStructure();
      fetchAndRenderAccounts(false);
      // Check every 3 seconds ONLY if button is missing (zero-mutation when present)
      setInterval(() => {
        const btn = document.getElementById('agy-avatar-trigger-btn');
        if (!btn || !btn.parentElement) {
          injectAvatarTriggerButton();
        }
      }, 3000);
    },
    openPopover,
    closePopover,
    togglePopover,
    requestSwitch: showConfirm,
    refresh: fetchAndRenderAccounts
  };

})();
