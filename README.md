<div align="center">
  <img src="assets/banner.webp" alt="Antigravity Account Switcher — Switch accounts. Stay in flow." width="100%" />
  <br />
  <h1>Antigravity Account Switcher</h1>
  <p><strong>Manage multiple Google accounts from inside Google Antigravity.</strong></p>
  <p>
    <strong>English</strong> · <a href="README.fa.md">فارسی</a>
  </p>
  <p>
    <a href="https://github.com/omid-io/antigravity-account-switcher"><img src="https://img.shields.io/github/last-commit/omid-io/antigravity-account-switcher?style=flat-square&label=last%20commit" alt="Last commit" /></a>
    <a href="https://github.com/omid-io/antigravity-account-switcher/blob/master/LICENSE"><img src="https://img.shields.io/github/license/omid-io/antigravity-account-switcher?style=flat-square" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows11&logoColor=white" alt="Windows" />
    <img src="https://img.shields.io/badge/Node.js-22.4%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22.4 or newer recommended" />
  </p>
  <p>
    <a href="#features">Features</a> ·
    <a href="#quick-start">Quick start</a> ·
    <a href="#using-the-switcher">Usage</a> ·
    <a href="#cli-reference">CLI</a> ·
    <a href="#security-and-data">Security</a>
  </p>
</div>

---

## What it does

**Antigravity Account Switcher** is a Windows-focused account manager for Google Antigravity Desktop. It adds an in-app account panel, keeps local snapshots of the Google sessions you choose to save, and lets you switch the active account without juggling separate launcher windows.

<div align="center">
  <img src="assets/preview.webp" alt="Antigravity Account Switcher - In-App Glassmorphic Modal & Quota Dashboard" width="85%" style="max-width: 720px;" />
  <p><em>In-app glassmorphic modal with real-time quota telemetry, countdown timers, and 1-click account swap.</em></p>
</div>

A lightweight Node.js sidecar connects to the Antigravity renderer through the Chrome DevTools Protocol (CDP). It coordinates the local account vault, reads quota information exposed by Antigravity's local Language Server, and can optionally react to quota-exhaustion signals.

> [!IMPORTANT]
> The current implementation targets **Windows**. It reads and writes the Antigravity credential in **Windows Credential Manager** and uses Antigravity paths under `%APPDATA%`. macOS and Linux are not currently supported by this codebase.

## Features

| Feature | What you get |
| --- | --- |
| **In-app account panel** | An account launcher and dashboard injected into the Antigravity desktop renderer. |
| **Local account vault** | Save session snapshots, keep multiple account profiles, and rename or remove saved profiles. |
| **Confirmed account switching** | Select a saved account, confirm the change, update the local credential, and request a Language Server restart and renderer reload when CDP is available. |
| **Quota overview** | View the available 5-hour and weekly quota buckets, plan information, and reset countdowns. |
| **Optional auto-switch** | When enabled, react to detected HTTP 429 / quota-exhaustion signals and select an eligible standby account. |
| **CLI** | List accounts, switch by email or ID, snapshot the current session, inspect status, view logs, and check for updates. |
| **No model-traffic proxy** | The project does not implement a third-party proxy for model requests; quota reads use Antigravity's local Language Server interface. |

### A note about quota data

The active account is queried through Antigravity's local Language Server RPC when the panel refreshes. Saved inactive accounts are displayed from their **most recently stored quota snapshot**; their values are not independently refreshed while they are inactive. The panel refreshes on open, on demand, and periodically while it remains open.

### How auto-switch works

Auto-switch is **off by default**. When enabled, the CDP bridge watches renderer console messages and network responses for quota-exhaustion signals such as `429`, `quota exceeded`, or `resource_exhausted`. It then considers inactive profiles marked `ready` with more than 10% remaining in **both** the 5-hour and weekly buckets, excluding accounts that need re-authentication. The account with the highest 5-hour remainder is preferred, with weekly remainder used as the tie-breaker.

This is best-effort event detection, not a guarantee that every quota error will be detected or that a request will always continue uninterrupted. The toggle is runtime state and returns to off when the sidecar restarts.

## Quick start

### Requirements

- Windows 10 or Windows 11.
- Google Antigravity Desktop installed and signed in at least once.
- Node.js **22.4+ recommended** for stable built-in WebSocket support used by the CDP bridge. `package.json` currently declares `node >=18`, but older Node versions may require the experimental WebSocket flag or may not support the CDP connection as expected.
- PowerShell and access to the current Windows user's Credential Manager.

### Option 1: 1-Line Native Windows PowerShell (Recommended — Zero Dependency)

Install or update directly from PowerShell with zero prerequisites (no npm, git, or clone needed):

```powershell
irm https://raw.githubusercontent.com/omid-io/antigravity-account-switcher/master/install.ps1 | iex
```

### Option 2: 1-Line npm / npx (Zero Clone Needed)

Install via npm registry with a single command:
```powershell
npx antigravity-account-switcher install
```

To update to the latest release with live hot-reload:
```powershell
npx antigravity-account-switcher update
```

Check system status and live account health:
```powershell
npx antigravity-account-switcher status
```

### Option 3: Install from source

```powershell
git clone https://github.com/omid-io/antigravity-account-switcher.git
cd antigravity-account-switcher
npm run install-plugin
```

The installer installs the project into:

```text
%USERPROFILE%\.gemini\config\plugins\antigravity-account-switcher
```

### Option 4: Antigravity Marketplace Card

For users inside Antigravity with marketplace integration enabled, invoke via:
```html
<plugin-card catalog-id="antigravity-account-switcher"></plugin-card>
```

It also attempts to inject the updated UI into a running Antigravity window. On a first install, or when live reload is unavailable, restart Antigravity or reload its window.

To remove the installed plugin later:

```powershell
npm run uninstall-plugin
```

## Using the switcher

1. Open Antigravity and locate the circular account-switcher control in the sidebar area (positioned directly opposite the **Settings** gear icon).
2. Open the panel to review the active account and saved profiles. Use **Refresh** to request an updated quota snapshot.
3. Choose **Add Account** to snapshot the current session and start the Google sign-in flow for another account. Complete sign-in inside Antigravity.
4. To change accounts, select a saved profile and confirm the switch. When the CDP bridge is connected, the sidecar also requests a Language Server restart and reloads the Antigravity renderer.
5. Turn on **Auto-Switch** only when you explicitly want the sidecar to react to detected quota-exhaustion events.

> **One active account at a time:** this project switches the active session in one Antigravity installation. It does not run multiple isolated Antigravity sessions concurrently or combine account quotas.

## CLI reference

Run commands via `npx antigravity-account-switcher <command>` (or `node bin/cli.js <command>` when working in the cloned repo):

| Command | Description |
| --- | --- |
| `npx antigravity-account-switcher list` | List saved profiles and their available quota snapshots. |
| `npx antigravity-account-switcher switch <email-or-id>` | Switch to a saved profile. |
| `npx antigravity-account-switcher snapshot "Work Account"` | Save or update a snapshot of the current session with a label. |
| `npx antigravity-account-switcher status` | Show the sidecar connection, installed version, and vault account count. |
| `npx antigravity-account-switcher logs 100` | Print the most recent 100 log lines. |
| `npx antigravity-account-switcher check-update` | Check the configured update sources for a newer version. |
| `npx antigravity-account-switcher start` | Start the sidecar manually. |
| `npx antigravity-account-switcher uninstall` | Remove the installed plugin. |
| `npx antigravity-account-switcher --help` | Show CLI help. |

If the sidecar is offline when `switch` is run, the CLI can update the saved Windows credential, but Antigravity may need a manual restart or reload before the change is reflected in the UI.

## How it is put together

```mermaid
flowchart TD
    A[Antigravity Desktop Renderer] <-->|Chrome DevTools Protocol| B[Node.js Sidecar]
    B <-->|Local HTTP API :51444| C[Injected Account Panel]
    B --> D[Vault Manager]
    D --> E[Windows Credential Manager]
    D --> F[Local JSON Profile Vault]
    B --> G[Quota Poller]
    G <-->|Local Language Server RPC| A
    B --> H[Auto-Switcher]
    A -->|Console / Network quota signals| H
```

The sidecar exposes its local API on `127.0.0.1:51444`. The CDP bridge discovers Antigravity's `DevToolsActivePort` file under `%APPDATA%\Antigravity` and connects to the renderer's WebSocket debugger endpoint.

## Security and data

> [!WARNING]
> **Saved session snapshots are stored as plain JSON files and are not encrypted by this application.** Treat the vault as highly sensitive credential material.

| Data | Location |
| --- | --- |
| Profile index | `~/.gemini/antigravity-switcher/vault/profiles.json` |
| Saved session snapshots | `~/.gemini/antigravity-switcher/vault/sessions/` |
| Active Antigravity credential | Windows Credential Manager — `LegacyGeneric:target=gemini:antigravity` |
| Active account email metadata | `%APPDATA%\Antigravity\app_storage.json` |

Keep your Windows user account and device protected. Do not commit, upload, or share the vault, session JSON files, or diagnostic logs without reviewing them for sensitive account information. The project does not claim to make account switching policy-proof or risk-free; use accounts you own and follow the terms that apply to your Google and Antigravity accounts.

The app's version checker may contact the npm registry and GitHub to check for updates. Quota retrieval itself is performed through the Antigravity local Language Server interface.

## Troubleshooting

**The account control does not appear**  
Reload or restart Antigravity, then run `npx antigravity-account-switcher status` (or `node bin/cli.js status`). The CDP bridge looks for `%APPDATA%\Antigravity\DevToolsActivePort`; if Antigravity does not expose that file, live UI injection and reload features may be unavailable.

**Quota values look stale or unavailable**  
Open the panel and press **Refresh** while Antigravity is running. The active account is the one queried live; inactive accounts use their last saved snapshot. A failed local Language Server request can leave the latest active quota unavailable.

**The CLI changed the credential but the UI still shows the old account**  
Check that the sidecar is online with `npx antigravity-account-switcher status`. If the CDP connection is unavailable, restart or reload Antigravity manually after switching.

**Auto-switch did not find a standby profile**  
The candidate needs to be inactive, in `ready` status, not marked for re-login, and above 10% in both quota buckets. Auto-switch must also be enabled in the panel.

## Development

```powershell
# Run the sidecar directly
npm run start

# Run the repository test suite
npm test
```

The tests exercise the local profile vault and session integration. For development, use a dedicated Windows test account/profile rather than a production environment containing credentials you cannot afford to modify.

## License

Released under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built for developers who switch accounts — not context.</sub>
</div>
