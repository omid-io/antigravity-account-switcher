/**
 * Client-side UI Engine for Antigravity Multi-Account Switcher.
 * Injected into the Antigravity desktop renderer window.
 */
(function() {
  // Allow hot updates when re-injected
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

  // 2. Cleanup legacy wrappers, dots or buttons if present
  function cleanupLegacy() {
    const legacyBtn = document.getElementById('agy-switcher-sidebar-btn');
    if (legacyBtn) legacyBtn.remove();

    const oldDot = document.getElementById('agy-avatar-quota-dot');
    if (oldDot) oldDot.remove();

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

    // If avatar button is already securely mounted inside the container, check badge structure
    const existingAvatar = document.getElementById('agy-avatar-trigger-btn');
    if (existingAvatar && existingAvatar.parentElement === container) {
      if (!existingAvatar.querySelector('.agy-avatar-badge')) {
        existingAvatar.innerHTML = `
          <div class="agy-avatar-badge">
            <div class="agy-avatar-inner-ring">
              <img id="agy-avatar-img" class="agy-avatar-img" src="" alt="Google Profile" style="display:none;" />
              <div id="agy-avatar-fallback" class="agy-avatar-fallback">G</div>
            </div>
          </div>
        `;
      }
      return;
    }

    // Create Circular Google Pro Avatar Button
    const avatarBtn = existingAvatar || document.createElement('button');
    avatarBtn.id = 'agy-avatar-trigger-btn';
    avatarBtn.title = 'Google Account & Live Quotas';

    if (!existingAvatar) {
      avatarBtn.innerHTML = `
        <div class="agy-avatar-badge">
          <div class="agy-avatar-inner-ring">
            <img id="agy-avatar-img" class="agy-avatar-img" src="" alt="Google Profile" style="display:none;" />
            <div id="agy-avatar-fallback" class="agy-avatar-fallback">G</div>
          </div>
        </div>
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
    const existingPopover = document.getElementById('agy-account-switcher-popover');
    if (existingPopover) {
      const closeBtn = document.getElementById('agy-popover-close');
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePopover();
        };
      }
      return;
    }

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
        <button id="agy-popover-close" class="agy-popover-close-btn" title="Close" onclick="window.__AGY_SWITCHER__?.closePopover()">
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

        <div class="agy-auto-switch-group">
          <div id="agy-auto-switch-container" class="agy-auto-switch-toggle" title="Toggle Auto-Switch">
            <span>Auto-Switch</span>
            <div id="agy-switch-track" class="agy-switch-track">
              <div class="agy-switch-thumb"></div>
            </div>
          </div>
          <div class="agy-info-wrapper" tabindex="0" role="tooltip" aria-label="Auto-switch information">
            <span class="agy-info-badge">!</span>
            <div class="agy-info-popover">
              <div class="agy-info-popover-header">
                <span class="agy-info-pill">
                  <span class="agy-info-dot"></span>
                  Auto-Switch
                </span>
                <span class="agy-info-tag">HTTP 429</span>
              </div>
              <p class="agy-info-popover-text">
                Automatically rotates to the next healthy account in your vault as soon as active quota is exhausted, ensuring a seamless uninterrupted workflow.
              </p>
            </div>
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

        <div class="agy-footer-right">
          <!-- Update Available Badge (Hidden by default, shown if update found) -->
          <div id="agy-update-pill" class="agy-update-pill" style="display:none;" title="Click to view update details">
            <span class="agy-update-dot"></span>
            <span id="agy-update-text">Update</span>
          </div>

          <!-- App Version & GitHub Link -->
          <a id="agy-github-link" class="agy-footer-github" href="https://github.com/omid-io/antigravity-account-switcher" target="_blank" rel="noopener noreferrer" title="View Source & Star on GitHub">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span class="agy-footer-info">v1.2.0</span>
          </a>
        </div>
      </div>

      <!-- Update Details Dialog (Soft Glass) -->
      <div id="agy-update-dialog" style="display:none;">
        <div class="agy-update-box">
          <div class="agy-update-header">
            <div class="agy-update-header-title">
              <span class="agy-update-badge-icon">🚀</span>
              <span>New Update Available</span>
            </div>
            <button id="agy-update-close" class="agy-popover-close-btn" title="Close">&times;</button>
          </div>
          <div class="agy-update-body">
            <div class="agy-update-version-row">
              <span class="agy-ver-tag old" id="agy-cur-ver">v1.2.0</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
              <span class="agy-ver-tag new" id="agy-new-ver">v1.2.0</span>
            </div>
            <div class="agy-update-cmd-box">
              <span class="agy-cmd-label">Run in terminal to update:</span>
              <div class="agy-cmd-wrapper">
                <code id="agy-cmd-code">npx antigravity-account-switcher</code>
                <button id="agy-copy-inline-btn" class="agy-copy-inline-btn" title="Copy to clipboard">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </div>
          </div>
          <div class="agy-update-actions">
            <button id="agy-update-github-btn" class="agy-cancel-btn">View on GitHub</button>
            <button id="agy-update-copy-btn" class="agy-confirm-btn">Copy Command</button>
          </div>
        </div>
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
    const closeBtn = document.getElementById('agy-popover-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
      };
    }
    document.getElementById('agy-refresh-btn')?.addEventListener('click', onRefreshClick);
    document.getElementById('agy-auto-switch-container')?.addEventListener('click', onToggleAutoSwitch);
    document.getElementById('agy-add-account-btn')?.addEventListener('click', onAddAccountClick);
    document.getElementById('agy-update-pill')?.addEventListener('click', showUpdateDialog);
    document.getElementById('agy-update-close')?.addEventListener('click', hideUpdateDialog);
    document.getElementById('agy-update-copy-btn')?.addEventListener('click', copyUpdateCommand);
    document.getElementById('agy-copy-inline-btn')?.addEventListener('click', copyUpdateCommand);
    document.getElementById('agy-update-github-btn')?.addEventListener('click', openUpdateGitHub);

    // Click outside to close popover
    document.addEventListener('click', (e) => {
      const popoverEl = document.getElementById('agy-account-switcher-popover');
      const isOpen = popoverEl ? popoverEl.classList.contains('open') : isPopoverOpen;
      if (!isOpen) return;
      const target = e.target;
      const trigger = document.getElementById('agy-avatar-trigger-btn');
      if ((popoverEl && popoverEl.contains(target)) || (trigger && trigger.contains(target))) {
        return;
      }
      closePopover();
    });

    // Press Escape to close popover
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const popoverEl = document.getElementById('agy-account-switcher-popover');
        if (popoverEl && popoverEl.classList.contains('open')) {
          closePopover();
        }
      }
    });
  }

  // 5. Popover Open, Close, Toggle
  async function togglePopover() {
    const popover = document.getElementById('agy-account-switcher-popover');
    const isOpen = popover ? popover.classList.contains('open') : isPopoverOpen;
    if (isOpen) {
      closePopover();
    } else {
      await openPopover();
    }
  }

  async function openPopover() {
    const popover = document.getElementById('agy-account-switcher-popover');
    const trigger = document.getElementById('agy-avatar-trigger-btn');
    if (!popover) return;

    // Clean any residual inline overrides
    popover.style.removeProperty('opacity');
    popover.style.removeProperty('visibility');
    popover.style.removeProperty('pointer-events');

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
    if (popover) {
      popover.classList.remove('open');
      // Remove any inline overrides so CSS !important applies cleanly
      popover.style.removeProperty('opacity');
      popover.style.removeProperty('visibility');
      popover.style.removeProperty('pointer-events');
    }
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

      // Check for updates in background
      checkUpdateStatus();
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
      const fiveHourPct = typeof acc.fiveHourPercent === 'number' ? acc.fiveHourPercent : (acc.remainingPercent || 100);
      const fiveHourLevel = fiveHourPct > 50 ? 'high' : (fiveHourPct > 20 ? 'med' : 'low');

      const weeklyPct = typeof acc.weeklyPercent === 'number' ? acc.weeklyPercent : 100;
      const weeklyLevel = weeklyPct > 50 ? 'high' : (weeklyPct > 20 ? 'med' : 'low');

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
              ${acc.isActive 
                ? `<div class="agy-active-indicator" title="Currently selected active session">
                     <span class="agy-active-dot"></span>
                     <span>Active</span>
                   </div>` 
                : `<button class="agy-card-switch-btn" onclick="window.__AGY_SWITCHER__.requestSwitch('${acc.id}', '${acc.label}', '${acc.email}')">
                     <span>Switch</span>
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                   </button>`
              }
            </div>
          </div>

          <!-- Dual Quotas: 5-Hour Limit & Weekly Limit -->
          <div class="agy-card-quotas-wrapper">
            <!-- 5-Hour Limit -->
            <div class="agy-quota-metric" title="${acc.fiveHourDesc || ''}">
              <div class="agy-quota-metric-header">
                <div class="agy-quota-title">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span>5-Hour Limit</span>
                </div>
                <div class="agy-quota-meta">
                  <span class="agy-quota-pct ${fiveHourLevel}">${fiveHourPct}%</span>
                  <span class="agy-quota-sep">•</span>
                  <span class="agy-quota-cd">${acc.fiveHourCountdownText || acc.resetCountdownText || 'Ready'}</span>
                </div>
              </div>
              <div class="agy-quota-track">
                <div class="agy-quota-fill ${fiveHourLevel}" style="width: ${fiveHourPct}%;"></div>
              </div>
            </div>

            <!-- Weekly Limit -->
            <div class="agy-quota-metric" title="${acc.weeklyDesc || ''}">
              <div class="agy-quota-metric-header">
                <div class="agy-quota-title">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span>Weekly Limit</span>
                </div>
                <div class="agy-quota-meta">
                  <span class="agy-quota-pct ${weeklyLevel}">${weeklyPct}%</span>
                  <span class="agy-quota-sep">•</span>
                  <span class="agy-quota-cd">${acc.weeklyCountdownText || 'Active Pool'}</span>
                </div>
              </div>
              <div class="agy-quota-track">
                <div class="agy-quota-fill ${weeklyLevel}" style="width: ${weeklyPct}%;"></div>
              </div>
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

  // 7. Update Management
  let cachedUpdateInfo = null;

  async function checkUpdateStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/check-update`);
      if (!res.ok) return;
      const data = await res.json();
      cachedUpdateInfo = data;

      const pill = document.getElementById('agy-update-pill');
      const text = document.getElementById('agy-update-text');
      if (pill && data.hasUpdate) {
        if (text) text.innerText = `v${data.latestVersion}`;
        pill.style.display = 'inline-flex';
      } else if (pill) {
        pill.style.display = 'none';
      }
    } catch (e) {
      console.warn('[agy-switcher] Update check failed:', e.message);
    }
  }

  function showUpdateDialog() {
    const dialog = document.getElementById('agy-update-dialog');
    if (!dialog) return;

    if (cachedUpdateInfo) {
      const curEl = document.getElementById('agy-cur-ver');
      const newEl = document.getElementById('agy-new-ver');
      const cmdEl = document.getElementById('agy-cmd-code');
      if (curEl) curEl.innerText = `v${cachedUpdateInfo.currentVersion}`;
      if (newEl) newEl.innerText = `v${cachedUpdateInfo.latestVersion}`;
      if (cmdEl && cachedUpdateInfo.updateCommand) cmdEl.innerText = cachedUpdateInfo.updateCommand;
    }
    dialog.style.display = 'flex';
  }

  function hideUpdateDialog() {
    const dialog = document.getElementById('agy-update-dialog');
    if (dialog) dialog.style.display = 'none';
  }

  async function copyUpdateCommand() {
    const cmdEl = document.getElementById('agy-cmd-code');
    const copyBtn = document.getElementById('agy-update-copy-btn');
    if (!cmdEl) return;
    try {
      await navigator.clipboard.writeText(cmdEl.innerText);
      if (copyBtn) {
        const orig = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        copyBtn.style.background = '#10b981';
        setTimeout(() => {
          copyBtn.innerText = orig;
          copyBtn.style.background = '';
        }, 1800);
      }
    } catch {}
  }

  function openUpdateGitHub() {
    const url = cachedUpdateInfo?.releaseUrl || cachedUpdateInfo?.repoUrl || 'https://github.com/omid-io/antigravity-account-switcher';
    window.open(url, '_blank');
  }

  // 8. Global Hook
  window.__AGY_SWITCHER__ = {
    init: function(css) {
      injectStyles(css);
      cleanupLegacy();
      injectAvatarTriggerButton();
      injectPopoverStructure();
      fetchAndRenderAccounts(false);
      // Check every 3 seconds ONLY if button is missing (clearing any stale interval)
      if (window.__AGY_SWITCHER_INTERVAL__) {
        clearInterval(window.__AGY_SWITCHER_INTERVAL__);
      }
      window.__AGY_SWITCHER_INTERVAL__ = setInterval(() => {
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
