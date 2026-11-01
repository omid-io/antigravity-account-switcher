import { listProfiles, updateProfileQuota } from './vault-manager.js';

/**
 * Calculates human-friendly countdown until resetTime.
 * Supports days, hours, and minutes.
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
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  let text = '';
  if (days > 0) {
    text = `${days}d ${hours}h`;
  } else if (hours > 0) {
    text = `${hours}h ${mins}m`;
  } else {
    text = `${mins}m`;
  }

  return { text: `Resets in ${text}`, isExpired: false, minutesLeft: totalMinutes };
}

/**
 * Calls GetUserStatus RPC via CDP to retrieve the live active quota and Google profile picture.
 * Extracts both 5-hour rolling limit (Flash) and weekly limit (Thinking/Claude).
 * @param {import('./cdp-bridge.js').CdpBridge} cdp 
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

        // 1. Five-Hour Rolling Model (Gemini Flash or first active with quota)
        const flashModel = configs.find(c => c.modelId && c.modelId.includes('flash') && c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number')
                        || configs.find(c => c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number');

        // 2. Weekly / Premium Model (Claude Sonnet/Opus Thinking or non-flash)
        const weeklyModel = configs.find(c => c.modelId && (c.modelId.includes('claude') || c.modelId.includes('thinking') || c.modelId.includes('sonnet')) && c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number');

        return {
          email: u.email || '',
          name: u.name || '',
          plan: u.planStatus?.planInfo?.planName || 'Pro',
          profilePictureUrl: u.profilePictureUrl || '',
          fiveHourQuota: flashModel ? flashModel.quotaInfo.remainingFraction : 1.0,
          fiveHourResetTime: flashModel ? flashModel.quotaInfo.resetTime : null,
          weeklyQuota: weeklyModel ? weeklyModel.quotaInfo.remainingFraction : (flashModel ? flashModel.quotaInfo.remainingFraction : 1.0),
          weeklyResetTime: weeklyModel ? weeklyModel.quotaInfo.resetTime : null
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
      updateProfileQuota(
        result.email,
        result.fiveHourQuota,
        result.fiveHourResetTime,
        result.plan,
        result.profilePictureUrl,
        result.name,
        result.weeklyQuota,
        result.weeklyResetTime
      );
    }

    return result;
  } catch (err) {
    console.error('[quota-poller] Failed to query live quota:', err.message);
    return null;
  }
}

/**
 * Returns formatted quota summary for all vaulted profiles with dual limits (5-Hour & Weekly).
 * @param {import('./cdp-bridge.js').CdpBridge} [cdp] 
 */
export async function getAllAccountsQuotaSummary(cdp) {
  // If CDP is available, refresh the active account quota first
  if (cdp && cdp.isConnected) {
    await fetchActiveQuota(cdp);
  }

  const profiles = listProfiles();
  return profiles.map(p => {
    // 5-Hour Limit
    let fiveHourFraction = typeof p.fiveHourQuota === 'number' ? p.fiveHourQuota : (typeof p.lastQuota === 'number' ? p.lastQuota : 1.0);
    const fiveHourReset = p.fiveHourResetTime || p.resetTime;
    const fiveHourCountdown = calculateResetCountdown(fiveHourReset);
    if (fiveHourCountdown.isExpired && fiveHourReset && fiveHourFraction < 1.0) {
      fiveHourFraction = 1.0;
    }
    const fiveHourPercent = Math.round(fiveHourFraction * 100);

    // Weekly Limit
    let weeklyFraction = typeof p.weeklyQuota === 'number' ? p.weeklyQuota : 1.0;
    const weeklyCountdown = calculateResetCountdown(p.weeklyResetTime);
    if (weeklyCountdown.isExpired && p.weeklyResetTime && weeklyFraction < 1.0) {
      weeklyFraction = 1.0;
    }
    const weeklyPercent = Math.round(weeklyFraction * 100);

    let status = 'ready';
    if (p.isActive) {
      status = 'active';
    } else if (fiveHourPercent === 0 || (!fiveHourCountdown.isExpired && fiveHourPercent < 10)) {
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
      // 5-Hour Limit properties
      fiveHourFraction,
      fiveHourPercent,
      fiveHourCountdownText: fiveHourCountdown.text,
      // Weekly Limit properties
      weeklyFraction,
      weeklyPercent,
      weeklyCountdownText: weeklyCountdown.text,
      // Legacy backward-compatibility mappings
      remainingFraction: fiveHourFraction,
      remainingPercent: fiveHourPercent,
      resetCountdownText: fiveHourCountdown.text,
      status: status
    };
  });
}
