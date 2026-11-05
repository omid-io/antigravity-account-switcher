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

  // 4. Inject Flyout Popover Structure (Unified Header, Soft Light)
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
      <!-- Header: Command Deck Bar -->
      <div class="agy-popover-header">
        <div class="agy-popover-header-brand">
          <div class="agy-engine-icon-badge" title="Antigravity Account Switcher">
            <svg class="agy-brand-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M17 11l4-4-4-4"></path>
              <path d="M21 7h-5"></path>
              <path d="M19 15l-4 4 4 4"></path>
              <path d="M15 19h5"></path>
            </svg>
          </div>
          <div class="agy-header-title-cluster">
            <div class="agy-header-title-row">
              <span class="agy-brand-title">Account Switcher</span>
              <a id="agy-version-tag" class="agy-version-tag" href="https://github.com/omid-io/antigravity-account-switcher" target="_blank" rel="noopener noreferrer" title="View on GitHub">v1.2.2</a>
              <div id="agy-update-pill" class="agy-update-pill" style="display:none;" title="Click to view update details">
                <span class="agy-update-dot"></span>
                <span id="agy-update-text">Update</span>
              </div>
            </div>
          </div>
        </div>

        <div class="agy-header-actions">
          <!-- Refresh Button (Ghost style) -->
          <button id="agy-refresh-btn" class="agy-ghost-btn" title="Refresh Live Quotas">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>

          <!-- Close Button (Ghost style) -->
          <button id="agy-popover-close" class="agy-ghost-btn close" title="Close" onclick="window.__AGY_SWITCHER__?.closePopover()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Accounts List Container (Directly under Header) -->
      <div id="agy-accounts-body" class="agy-popover-body">
        <div style="text-align:center;padding:24px;color:var(--agy-text-muted);font-size:12px;">Loading accounts...</div>
      </div>

      <!-- Footer: Tactical Control Dock -->
      <div class="agy-popover-footer">
        <button id="agy-add-account-btn" class="agy-add-account-btn" title="Link new Google account">
          <div class="agy-btn-icon-plus">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <span>Add Account</span>
        </button>

        <div class="agy-footer-dock-cluster">
          <div class="agy-dock-divider"></div>

          <div class="agy-footer-auto-switch" title="Auto-switch to standby account when quota exhausted (HTTP 429)">
            <label for="agy-auto-switch-container" class="agy-auto-switch-label" style="cursor:pointer;" onclick="document.getElementById('agy-auto-switch-container')?.click()">Auto-Switch</label>

            <div class="agy-info-wrapper" tabindex="0" role="tooltip" aria-label="Auto-switch information">
              <span class="agy-info-badge" title="Auto-Switch Information">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </span>
              <div class="agy-info-popover">
                <div class="agy-info-popover-header">
                  <span class="agy-info-pill">
                    <span class="agy-info-dot"></span>
                    Auto-Switch
                  </span>
                  <span class="agy-info-tag">HTTP 429</span>
                </div>
                <p class="agy-info-popover-text">
                  Automatically rotates to the next available account in your vault as soon as active quota is exhausted, ensuring a seamless uninterrupted workflow.
                </p>
              </div>
            </div>

            <button type="button" role="switch" id="agy-auto-switch-container" class="agy-auto-switch-toggle" aria-checked="false" title="Toggle Auto-Switch on quota exhaustion" style="background:none;border:none;padding:0;cursor:pointer;">
              <div id="agy-switch-track" class="agy-switch-track">
                <div class="agy-switch-thumb"></div>
              </div>
            </button>
          </div>
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
            <button id="agy-update-close" class="agy-ghost-btn close" title="Close">&times;</button>
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

      <!-- Confirmation Dialog: Switch Account -->
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

      <!-- Delete Dialog -->
      <div id="agy-delete-dialog" style="display:none;">
        <div class="agy-confirm-box">
          <h4 class="agy-confirm-title">Remove Account?</h4>
          <p id="agy-delete-text" class="agy-confirm-text">Remove this account from vault?</p>
          <div class="agy-confirm-actions">
            <button id="agy-delete-cancel" class="agy-cancel-btn">Cancel</button>
            <button id="agy-delete-proceed" class="agy-confirm-btn danger">Remove</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popover);

    // Event listeners
    document.getElementById('agy-popover-close')?.addEventListener('click', closePopover);
    document.getElementById('agy-refresh-btn')?.addEventListener('click', onRefreshClick);
    const autoSwitchEl = document.getElementById('agy-auto-switch-container');
    if (autoSwitchEl) {
      autoSwitchEl.addEventListener('click', onToggleAutoSwitch);
      autoSwitchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleAutoSwitch();
        }
      });
    }
    document.getElementById('agy-add-account-btn')?.addEventListener('click', onAddAccountClick);
    document.getElementById('agy-update-pill')?.addEventListener('click', showUpdateDialog);
    document.getElementById('agy-update-close')?.addEventListener('click', hideUpdateDialog);
    document.getElementById('agy-update-copy-btn')?.addEventListener('click', copyUpdateCommand);
    document.getElementById('agy-copy-inline-btn')?.addEventListener('click', copyUpdateCommand);
    document.getElementById('agy-update-github-btn')?.addEventListener('click', openUpdateGitHub);

    // Bulletproof click-outside & escape listeners (Capture Phase to bypass VS Code stopPropagation)
    if (window.__AGY_OUTSIDE_HANDLER__) {
      window.removeEventListener('pointerdown', window.__AGY_OUTSIDE_HANDLER__, true);
      window.removeEventListener('mousedown', window.__AGY_OUTSIDE_HANDLER__, true);
    }

    window.__AGY_OUTSIDE_HANDLER__ = (e) => {
      if (!isPopoverOpen) return;
      const target = e.target;
      const pop = document.getElementById('agy-account-switcher-popover');
      const trig = document.getElementById('agy-avatar-trigger-btn');
      if (!pop) return;

      // If clicked inside popover or on the avatar button, ignore
      if (target && target instanceof Node) {
        if (pop.contains(target) || (trig && trig.contains(target))) {
          return;
        }
      }

      closePopover();
    };

    window.addEventListener('pointerdown', window.__AGY_OUTSIDE_HANDLER__, true);
    window.addEventListener('mousedown', window.__AGY_OUTSIDE_HANDLER__, true);

    if (!window.__AGY_KEY_BOUND__) {
      window.__AGY_KEY_BOUND__ = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isPopoverOpen) {
          // If child dialogs are active, dismiss child dialog first
          const updateDlg = document.getElementById('agy-update-dialog');
          const confirmDlg = document.getElementById('agy-confirm-dialog');
          const deleteDlg = document.getElementById('agy-delete-dialog');
          if (updateDlg && updateDlg.style.display !== 'none') {
            hideUpdateDialog();
            return;
          }
          if (confirmDlg && confirmDlg.style.display !== 'none') {
            hideConfirm();
            return;
          }
          if (deleteDlg && deleteDlg.style.display !== 'none') {
            hideDeleteDialog();
            return;
          }
          closePopover();
        }
      }, true);
    }
  }

  // 5. Popover Open, Close, Toggle
  let openPopoverRefreshInterval = null;

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

    // Refresh accounts immediately on open
    await fetchAndRenderAccounts(true);

    // Auto-refresh every 30 seconds while popover is open
    if (openPopoverRefreshInterval) clearInterval(openPopoverRefreshInterval);
    openPopoverRefreshInterval = setInterval(() => {
      if (isPopoverOpen) {
        fetchAndRenderAccounts(true);
      } else {
        clearInterval(openPopoverRefreshInterval);
        openPopoverRefreshInterval = null;
      }
    }, 30000);
  }

  function closePopover() {
    const popover = document.getElementById('agy-account-switcher-popover');
    if (popover) popover.classList.remove('open');
    isPopoverOpen = false;
    if (openPopoverRefreshInterval) {
      clearInterval(openPopoverRefreshInterval);
      openPopoverRefreshInterval = null;
    }
    hideConfirm();
    hideDeleteDialog();
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

    if (active.profilePictureUrl && img) {
      img.src = active.profilePictureUrl;
      img.style.display = 'block';
      if (fallback) fallback.style.display = 'none';
    } else if (fallback) {
      fallback.innerText = (active.name || active.email || 'G').slice(0, 1).toUpperCase();
      fallback.style.display = 'flex';
      if (img) img.style.display = 'none';
    }
  }

  function updateAutoSwitchUI(active) {
    const track = document.getElementById('agy-switch-track');
    const container = document.getElementById('agy-auto-switch-container');
    if (track) {
      if (active) track.classList.add('active');
      else track.classList.remove('active');
    }
    if (container) {
      container.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  }

  function renderContinuousBar(pct, level, isHero = false) {
    const safePct = Math.max(0, Math.min(100, Math.round(pct)));
    if (isHero) {
      return `
        <div class="agy-smooth-track hero" title="${safePct}% Remaining">
          <div class="agy-smooth-fill ${level} hero" style="width: ${safePct}%;">
            <div class="agy-shimmer-flow"></div>
            <div class="agy-lead-glow"></div>
          </div>
        </div>
      `;
    }
    return `
      <div class="agy-smooth-track standby" title="${safePct}% Remaining">
        <div class="agy-smooth-fill ${level}" style="width: ${safePct}%;"></div>
      </div>
    `;
  }

  function renderAccountCards(accounts) {
    const body = document.getElementById('agy-accounts-body');
    if (!body) return;

    if (!accounts || accounts.length === 0) {
      body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--agy-text-muted);font-size:12px;">No accounts found. Click "Add Account" below.</div>`;
      return;
    }

    // Identify active hero session and standby reserve accounts
    const activeAccount = accounts.find(a => a.isActive) || accounts[0];
    const standbyAccounts = accounts.filter(a => a !== activeAccount);

    // Update count in header
    const countBadge = document.getElementById('agy-accounts-count');
    if (countBadge) countBadge.innerText = accounts.length;

    // Helper to format initials and avatars
    const getAvatarHtml = (acc, isHero = false) => {
      const initials = (acc.name || acc.email || 'A').slice(0, 1).toUpperCase();
      if (acc.profilePictureUrl) {
        return `<img src="${acc.profilePictureUrl}" alt="Avatar" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" /><span style="display:none;">${initials}</span>`;
      }
      return `<span>${initials}</span>`;
    };

    const getPlanClass = (planRaw) => {
      const p = (planRaw || 'Free').toLowerCase();
      if (p.includes('pro')) return 'pro';
      if (p.includes('team') || p.includes('ultimate')) return 'teams';
      return 'free';
    };

    // --- 1. RENDER BENTO HERO COCKPIT (Active Live Session) ---
    const heroFiveHourPct = typeof activeAccount.fiveHourPercent === 'number' ? activeAccount.fiveHourPercent : (activeAccount.remainingPercent || 100);
    const heroFiveHourLevel = heroFiveHourPct > 50 ? 'healthy' : (heroFiveHourPct > 20 ? 'warning' : 'critical');
    const heroWeeklyPct = typeof activeAccount.weeklyPercent === 'number' ? activeAccount.weeklyPercent : 100;
    const heroWeeklyLevel = heroWeeklyPct > 50 ? 'healthy' : (heroWeeklyPct > 20 ? 'warning' : 'critical');
    const heroDisplayEmail = (activeAccount.email || '').replace(/@(gmail|googlemail)\.com$/i, '');
    const heroPlan = (activeAccount.plan || 'Free').toUpperCase();
    const heroPlanClass = getPlanClass(activeAccount.plan);

    const heroCockpitHtml = `
      <div class="agy-hero-cockpit">
        <div class="agy-cockpit-ambient-glow"></div>
        <div class="agy-cockpit-header">
          <div class="agy-cockpit-pilot">
            <div class="agy-cockpit-avatar-wrapper">
              <div class="agy-cockpit-avatar">
                ${getAvatarHtml(activeAccount, true)}
              </div>
            </div>
            <div class="agy-cockpit-identity">
              <div class="agy-cockpit-name-row">
                <span class="agy-cockpit-username" title="${activeAccount.email}">${heroDisplayEmail}</span>
                <span class="agy-foil-badge ${heroPlanClass}">${heroPlan}</span>
              </div>
            </div>
          </div>
          <div class="agy-active-indicator" title="Currently active session">
            <span class="agy-active-dot"></span>
            <span>ACTIVE</span>
          </div>
        </div>

        <!-- Telemetry Gauges (Segmented LED Bars) -->
        <div class="agy-cockpit-telemetry">
          <!-- 5-Hour Session Meter -->
          <div class="agy-telemetry-gauge-card" title="${activeAccount.fiveHourDesc || ''}">
            <div class="agy-gauge-top">
              <div class="agy-gauge-title">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>5-Hour Quota</span>
              </div>
              <div class="agy-gauge-readout">
                <span class="agy-gauge-pct ${heroFiveHourLevel}">${heroFiveHourPct}%</span>
                <span class="agy-gauge-countdown">${activeAccount.fiveHourCountdownText || activeAccount.resetCountdownText || 'Ready'}</span>
              </div>
            </div>
            ${renderContinuousBar(heroFiveHourPct, heroFiveHourLevel, true)}
          </div>

          <!-- Weekly Horizon Meter -->
          <div class="agy-telemetry-gauge-card" title="${activeAccount.weeklyDesc || ''}">
            <div class="agy-gauge-top">
              <div class="agy-gauge-title">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span>Weekly Pool</span>
              </div>
              <div class="agy-gauge-readout">
                <span class="agy-gauge-pct ${heroWeeklyLevel}">${heroWeeklyPct}%</span>
                <span class="agy-gauge-countdown">${activeAccount.weeklyCountdownText || 'Active'}</span>
              </div>
            </div>
            ${renderContinuousBar(heroWeeklyPct, heroWeeklyLevel, true)}
          </div>
        </div>
      </div>
    `;

    // --- 2. RENDER STANDBY ACCOUNTS VAULT (High-Density Shelf) ---
    let standbyShelfHtml = '';
    if (standbyAccounts.length > 0) {
      standbyShelfHtml = `
        <div class="agy-standby-vault-shelf">
          <div class="agy-standby-shelf-header">
            <span class="agy-shelf-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
              <span>STANDBY ACCOUNTS</span>
            </span>
            <span class="agy-shelf-count">${standbyAccounts.length}</span>
          </div>

          <div class="agy-standby-list">
            ${standbyAccounts.map(acc => {
              const fivePct = typeof acc.fiveHourPercent === 'number' ? acc.fiveHourPercent : (acc.remainingPercent || 100);
              const fiveLvl = fivePct > 50 ? 'healthy' : (fivePct > 20 ? 'warning' : 'critical');
              const wkPct = typeof acc.weeklyPercent === 'number' ? acc.weeklyPercent : 100;
              const wkLvl = wkPct > 50 ? 'healthy' : (wkPct > 20 ? 'warning' : 'critical');
              const emailDisplay = (acc.email || '').replace(/@(gmail|googlemail)\.com$/i, '');
              const plan = (acc.plan || 'Free').toUpperCase();
              const planClass = getPlanClass(acc.plan);
              const needsRelogin = acc.status === 'needs_relogin';

              return `
                <div class="agy-standby-card-d2">
                  <!-- Row 1: Identity & Actions -->
                  <div class="agy-standby-top-row">
                    <div class="agy-standby-identity-left">
                      <div class="agy-standby-avatar-wrapper">
                        <div class="agy-standby-micro-avatar">
                          ${getAvatarHtml(acc)}
                        </div>
                        <span class="agy-status-pip ${needsRelogin ? 'critical' : 'ready'}"></span>
                      </div>
                      <span class="agy-standby-username" title="${acc.email}">${emailDisplay}</span>
                      <span class="agy-mini-badge ${planClass}">${plan}</span>
                    </div>

                    <div class="agy-standby-actions-cluster">
                      ${needsRelogin ? `
                        <button class="agy-btn-tactile-swap relogin" onclick="window.__AGY_SWITCHER__.requestRelogin('${acc.id}', '${acc.email}')" title="Re-authenticate session">
                          <span>Re-login</span>
                        </button>
                      ` : `
                        <button class="agy-btn-tactile-swap" onclick="window.__AGY_SWITCHER__.requestSwitch('${acc.id}', '${acc.email}')" title="Switch to this account">
                          <svg class="agy-swap-bolt" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                          </svg>
                          <span>Switch</span>
                        </button>
                      `}
                      <button class="agy-card-delete-btn" onclick="window.__AGY_SWITCHER__.requestDelete('${acc.id}', '${acc.email}')" title="Remove account">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </div>

                  <!-- Row 2: Extended Balanced Telemetry Strip -->
                  <div class="agy-standby-telemetry-strip">
                    <div class="agy-telemetry-half" title="${acc.fiveHourDesc || '5-Hour Quota: ' + fivePct + '%'}">
                      <span class="agy-telemetry-name">5H</span>
                      ${renderContinuousBar(fivePct, fiveLvl, false)}
                      <span class="agy-telemetry-readout ${fiveLvl}">${fivePct}%</span>
                    </div>

                    <div class="agy-telemetry-center-divider"></div>

                    <div class="agy-telemetry-half" title="${acc.weeklyDesc || 'Weekly Pool: ' + wkPct + '%'}">
                      <span class="agy-telemetry-name">WK</span>
                      ${renderContinuousBar(wkPct, wkLvl, false)}
                      <span class="agy-telemetry-readout ${wkLvl}">${wkPct}%</span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    body.innerHTML = heroCockpitHtml + standbyShelfHtml;
  }

  // 8. Action Handlers: Refresh, AutoSwitch, AddAccount
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

  // 9. Modal Dialogs: Switch, Delete, Relogin
  let switchWatchdogTimer = null;

  function showConfirm(accId, email) {
    const dialog = document.getElementById('agy-confirm-dialog');
    const text = document.getElementById('agy-confirm-text');
    const proceedBtn = document.getElementById('agy-confirm-proceed');
    const cancelBtn = document.getElementById('agy-confirm-cancel');

    if (!dialog || !text) return;

    if (switchWatchdogTimer) {
      clearTimeout(switchWatchdogTimer);
      switchWatchdogTimer = null;
    }

    text.innerHTML = `Switch active Google account to <strong>${email}</strong>?<br><span style="font-size:11px;color:#64748b;display:block;margin-top:6px;">All active chats and projects remain safe.</span>`;
    dialog.style.display = 'flex';

    cancelBtn.onclick = hideConfirm;
    proceedBtn.onclick = async () => {
      proceedBtn.innerText = 'Switching...';
      proceedBtn.disabled = true;

      // 7-second safety watchdog: resets button and unlocks UI if reload is delayed or severed
      if (switchWatchdogTimer) clearTimeout(switchWatchdogTimer);
      switchWatchdogTimer = setTimeout(() => {
        proceedBtn.innerText = 'Confirm Switch';
        proceedBtn.disabled = false;
        alert('Switch response received, but window reload was delayed. Please check active account.');
      }, 7000);

      try {
        const res = await fetch(`${API_BASE}/api/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: accId })
        });
        const data = await res.json();
        if (data.alreadyActive) {
          if (switchWatchdogTimer) {
            clearTimeout(switchWatchdogTimer);
            switchWatchdogTimer = null;
          }
          hideConfirm();
          await fetchAndRenderAccounts(true);
        } else if (!res.ok) {
          if (switchWatchdogTimer) {
            clearTimeout(switchWatchdogTimer);
            switchWatchdogTimer = null;
          }
          alert('Switch notice: ' + (data.error || 'Switch failed'));
          hideConfirm();
        }
      } catch (e) {
        if (switchWatchdogTimer) {
          clearTimeout(switchWatchdogTimer);
          switchWatchdogTimer = null;
        }
        alert('Switch failed: ' + e.message);
        hideConfirm();
      }
    };
  }

  function hideConfirm() {
    if (switchWatchdogTimer) {
      clearTimeout(switchWatchdogTimer);
      switchWatchdogTimer = null;
    }
    const dialog = document.getElementById('agy-confirm-dialog');
    const proceedBtn = document.getElementById('agy-confirm-proceed');
    if (dialog) dialog.style.display = 'none';
    if (proceedBtn) {
      proceedBtn.innerText = 'Confirm Switch';
      proceedBtn.disabled = false;
    }
  }

  // Delete Account Dialog
  function showDeleteConfirm(accId, email) {
    const dialog = document.getElementById('agy-delete-dialog');
    const text = document.getElementById('agy-delete-text');
    const proceedBtn = document.getElementById('agy-delete-proceed');
    const cancelBtn = document.getElementById('agy-delete-cancel');
    if (!dialog || !text) return;

    text.innerHTML = `Are you sure you want to remove <strong>${email}</strong> from switcher?<br><span style="font-size:11px;color:#ef4444;display:block;margin-top:6px;">Credentials for this account will be removed locally.</span>`;
    dialog.style.display = 'flex';

    cancelBtn.onclick = hideDeleteDialog;
    proceedBtn.onclick = async () => {
      proceedBtn.innerText = 'Removing...';
      proceedBtn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/api/delete-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: accId })
        });
        const d = await res.json();
        if (d.ok) {
          hideDeleteDialog();
          await fetchAndRenderAccounts(false);
        } else {
          alert('Delete failed: ' + (d.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Delete error: ' + err.message);
      } finally {
        proceedBtn.innerText = 'Remove';
        proceedBtn.disabled = false;
      }
    };
  }

  function hideDeleteDialog() {
    const dialog = document.getElementById('agy-delete-dialog');
    if (dialog) dialog.style.display = 'none';
  }

  // Request Re-login
  async function requestRelogin(accId, email) {
    if (confirm(`Session for ${email} needs re-authentication. Switch and open login now?`)) {
      try {
        await fetch(`${API_BASE}/api/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: accId })
        });
      } catch (e) {
        alert('Switch failed: ' + e.message);
      }
    }
  }

  // 10. Update Management
  let cachedUpdateInfo = null;

  async function checkUpdateStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/check-update`);
      if (!res.ok) return;
      const data = await res.json();
      cachedUpdateInfo = data;

      const pill = document.getElementById('agy-update-pill');
      const text = document.getElementById('agy-update-text');
      const verTag = document.getElementById('agy-version-tag');
      if (pill && data.hasUpdate) {
        if (text) text.innerText = `Update v${data.latestVersion}`;
        pill.style.display = 'inline-flex';
        if (verTag) verTag.style.display = 'none';
      } else if (pill) {
        pill.style.display = 'none';
        if (verTag) verTag.style.display = 'inline-flex';
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

  // 11. Global Hook
  window.__AGY_SWITCHER__ = {
    init: function(css) {
      injectStyles(css);
      cleanupLegacy();
      injectAvatarTriggerButton();
      injectPopoverStructure();
      fetchAndRenderAccounts(false);
      // Check every 3 seconds ONLY if button is missing
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
    requestDelete: showDeleteConfirm,
    requestRelogin: requestRelogin,
    refresh: fetchAndRenderAccounts
  };

})();
