import { listProfiles, updateProfileQuota } from './vault-manager.js';

/**
 * Calculates human-friendly countdown until resetTime.
 * @param {string|null} resetTimeIso 
 * @returns {{ text: string, isExpired: boolean, minutesLeft: number }}
 */
export function calculateResetCountdown(resetTimeIso) {
  if (!resetTimeIso) {
    return { text: 'Refreshed', isExpired: true, minutesLeft: 0 };
  }

  const resetDate = new Date(resetTimeIso);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { text: 'Ready (Refilled)', isExpired: true, minutesLeft: 0 };
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  let text = '';
  if (hours > 0) {
    text = `${hours}h ${mins}m`;
  } else {
    text = `${mins}m`;
  }

  return { text: `Resets in ${text}`, isExpired: false, minutesLeft: totalMinutes };
}

/**
 * Calls GetUserStatus RPC via CDP to retrieve the live active quota and Google profile picture.
 * @param {import('./cdp-bridge.js').CdpBridge} cdp 
 * @returns {Promise<{ email: string, name: string, plan: string, profilePictureUrl: string, remainingFraction: number, resetTime: string }|null>}
 */
export async function fetchActiveQuota(cdp) {
  try {
    const expr = `(async () => {
      try {
        const csrf = window.__APP_CONFIG__?.csrfToken || '';
        const port = window.location.port || '51339';
        const res = await fetch('https://127.0.0.1:' + port + '/exa.language_server_pb.LanguageServerService/GetUserStatus', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-codeium-csrf-token': csrf
          },
          body: JSON.stringify({})
        });
        if (!res.ok) return { error: 'HTTP ' + res.status };
        const data = await res.json();
        const u = data.userStatus || {};
        const configs = u.cascadeModelConfigData?.clientModelConfigs || [];
        const modelWithQuota = configs.find(c => c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number');

        return {
          email: u.email || '',
          name: u.name || '',
          plan: u.planStatus?.planInfo?.planName || 'Pro',
          profilePictureUrl: u.profilePictureUrl || '',
          remainingFraction: modelWithQuota ? modelWithQuota.quotaInfo.remainingFraction : 1.0,
          resetTime: modelWithQuota ? modelWithQuota.quotaInfo.resetTime : null
        };
      } catch (e) {
        return { error: e.message };
      }
    })()`;

    const result = await cdp.evaluate(expr);
    if (!result || result.error) {
      console.warn('[quota-poller] Live quota check returned error:', result?.error);
      return null;
    }

    // Update active profile in vault
    if (result.email) {
      updateProfileQuota(result.email, result.remainingFraction, result.resetTime, result.plan, result.profilePictureUrl, result.name);
    }

    return result;
  } catch (err) {
    console.error('[quota-poller] Failed to query live quota:', err.message);
    return null;
  }
}

/**
 * Returns formatted quota summary for all vaulted profiles.
 * @param {import('./cdp-bridge.js').CdpBridge} [cdp] 
 */
export async function getAllAccountsQuotaSummary(cdp) {
  // If CDP is available, refresh the active account quota first
  if (cdp && cdp.isConnected) {
    await fetchActiveQuota(cdp);
  }

  const profiles = listProfiles();
  return profiles.map(p => {
    let fraction = typeof p.lastQuota === 'number' ? p.lastQuota : 1.0;
    const countdown = calculateResetCountdown(p.resetTime);

    // If cooldown has expired, quota has refilled
    if (countdown.isExpired && p.resetTime && fraction < 1.0) {
      fraction = 1.0;
    }

    const percent = Math.round(fraction * 100);

    let status = 'ready';
    if (p.isActive) {
      status = 'active';
    } else if (percent === 0 || (!countdown.isExpired && percent < 10)) {
      status = 'cooldown';
    }

    return {
      id: p.id,
      label: p.label,
      email: p.email,
      name: p.name || '',
      profilePictureUrl: p.profilePictureUrl || '',
      plan: p.plan || 'Pro',
      isActive: !!p.isActive,
      remainingFraction: fraction,
      remainingPercent: percent,
      resetCountdownText: countdown.text,
      status: status
    };
  });
}
