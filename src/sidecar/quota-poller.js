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
 * Calls RetrieveUserQuotaSummary and GetUserStatus RPCs via CDP to retrieve 
 * the live active quota (5-hour limit and weekly limit) and Google profile metadata.
 * @param {import('./cdp-bridge.js').CdpBridge} cdp 
 */
export async function fetchActiveQuota(cdp) {
  try {
    const expr = `(async () => {
      try {
        const csrf = window.__APP_CONFIG__?.csrfToken || '';
        const port = window.location.port || '51339';
        const headers = {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrf
        };

        // 1. Fetch User Profile Info (name, email, plan, avatar)
        const statusRes = await fetch('https://127.0.0.1:' + port + '/exa.language_server_pb.LanguageServerService/GetUserStatus', {
          method: 'POST',
          headers,
          body: JSON.stringify({})
        });
        const statusData = statusRes.ok ? await statusRes.json() : {};
        const u = statusData.userStatus || {};

        // 2. Fetch Official Quota Summary (Gemini Weekly & 5-Hour rolling buckets)
        let fiveHourQuota = 1.0;
        let fiveHourResetTime = null;
        let fiveHourDesc = '';
        let weeklyQuota = 1.0;
        let weeklyResetTime = null;
        let weeklyDesc = '';

        try {
          const quotaRes = await fetch('https://127.0.0.1:' + port + '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary', {
            method: 'POST',
            headers,
            body: JSON.stringify({})
          });
          if (quotaRes.ok) {
            const quotaData = await quotaRes.json();
            const groups = quotaData.response?.groups || [];
            // Primary group is Gemini Models (or first group)
            const geminiGroup = groups.find(g => g.displayName && g.displayName.includes('Gemini')) || groups[0];
            if (geminiGroup && geminiGroup.buckets) {
              const weeklyBucket = geminiGroup.buckets.find(b => b.window === 'weekly' || b.bucketId === 'gemini-weekly');
              const fiveHourBucket = geminiGroup.buckets.find(b => b.window === '5h' || b.bucketId === 'gemini-5h');

              if (weeklyBucket) {
                weeklyQuota = typeof weeklyBucket.remainingFraction === 'number' ? weeklyBucket.remainingFraction : 1.0;
                weeklyResetTime = weeklyBucket.resetTime || null;
                weeklyDesc = weeklyBucket.description || '';
              }
              if (fiveHourBucket) {
                fiveHourQuota = typeof fiveHourBucket.remainingFraction === 'number' ? fiveHourBucket.remainingFraction : 1.0;
                fiveHourResetTime = fiveHourBucket.resetTime || null;
                fiveHourDesc = fiveHourBucket.description || '';
              }
            }
          }
        } catch (eQuota) {
          console.warn('[quota-poller] RetrieveUserQuotaSummary failed, falling back to clientModelConfigs:', eQuota);
        }

        // Fallback to clientModelConfigs if RetrieveUserQuotaSummary didn't provide buckets
        if (fiveHourResetTime === null && weeklyResetTime === null) {
          const configs = u.cascadeModelConfigData?.clientModelConfigs || [];
          const flashModel = configs.find(c => c.modelId && c.modelId.includes('flash') && c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number')
                          || configs.find(c => c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number');
          const weeklyModel = configs.find(c => c.modelId && (c.modelId.includes('claude') || c.modelId.includes('thinking') || c.modelId.includes('sonnet')) && c.quotaInfo && typeof c.quotaInfo.remainingFraction === 'number');

          if (flashModel && flashModel.quotaInfo) {
            fiveHourQuota = flashModel.quotaInfo.remainingFraction;
            fiveHourResetTime = flashModel.quotaInfo.resetTime || null;
          }
          if (weeklyModel && weeklyModel.quotaInfo) {
            weeklyQuota = weeklyModel.quotaInfo.remainingFraction;
            weeklyResetTime = weeklyModel.quotaInfo.resetTime || null;
          }
        }

        return {
          email: u.email || '',
          name: u.name || '',
          plan: u.planStatus?.planInfo?.planName || 'Pro',
          profilePictureUrl: u.profilePictureUrl || '',
          fiveHourQuota,
          fiveHourResetTime,
          fiveHourDesc,
          weeklyQuota,
          weeklyResetTime,
          weeklyDesc
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
        result.weeklyResetTime,
        result.fiveHourDesc,
        result.weeklyDesc
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
      fiveHourDesc: p.fiveHourDesc || '',
      // Weekly Limit properties
      weeklyFraction,
      weeklyPercent,
      weeklyCountdownText: weeklyCountdown.text,
      weeklyDesc: p.weeklyDesc || '',
      // Legacy backward-compatibility mappings
      remainingFraction: fiveHourFraction,
      remainingPercent: fiveHourPercent,
      resetCountdownText: fiveHourCountdown.text,
      status: status
    };
  });
}
