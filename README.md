<div align="center">

<img src="assets/banner.webp" alt="Antigravity Account Switcher Banner" width="100%">

# 🌌 Antigravity Account Switcher

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg)](https://microsoft.com/windows)
[![Antigravity](https://img.shields.io/badge/Antigravity-2.0%2B-blueviolet.svg)](https://github.com/google)

**The first native in-app Multi-Account & Live Quota Switcher for Google Antigravity 2.0 Desktop.**  
*Seamless sidebar integration · Zero external windows · Zero network proxies · 100% Ban-Safe.*

[Key Features](#-key-features) • [Architecture](#-architecture) • [Installation](#-installation) • [CLI Usage](#-cli-usage) • [Security](#-security--human-safety)

</div>

---

## ⚡ The Problem with Existing Solutions

Developers using multiple Google accounts on Antigravity to manage quotas face critical obstacles:
- **External Windows (Tauri/Electron/Web):** Forces you to `Alt+Tab` away from your active coding workspace.
- **CLI-Only Switchers:** Blind terminal commands that lack real-time visibility into usage percentages and reset countdowns.
- **Local Intercepting Proxies:** Rerouting OAuth requests through unofficial local proxies carries high risks of Google Sybil detection and account bans.

**Antigravity Account Switcher** solves this natively. It runs 100% inside your existing Antigravity 2.0 desktop shell via a lightweight Sidecar and Chrome DevTools Protocol (CDP) bridge.

---

## ✨ Key Features

1. **Native Sidebar Button:** Injects cleanly right above the `Settings` gear icon with matching Antigravity dark/light design and an active quota percentage badge (`72%`).
2. **Glassmorphic In-App Modal:** Click the sidebar button to open a sleek, frosted glass modal displaying all registered accounts, their tier (`Pro`), remaining quotas, and live countdown timers (`Resets in 2h 45m`).
3. **1-Click Human-Safe Swap:** Swaps official Google OAuth sessions on disk atomically with a sub-2-second soft window reload (`location.reload()`). Zero proxies.
4. **Shared Chats & Workspaces:** Unlike full profile isolation, your open projects, active conversations, and editor state remain 100% preserved when switching accounts.
5. **Intelligent Auto-Switch:** Optional toggle that detects `429 Quota Exceeded` errors during chat/coding and automatically switches to the account with the highest available quota.
6. **On-Demand Quota Refresh:** Dedicated "Refresh Quotas" button that queries Antigravity's official local Language Server RPC without aggressive background network polling.

---

## 🛠️ Architecture

```mermaid
flowchart TD
    subgraph Antigravity 2.0 Desktop
        DOM[Renderer Window / Sidebar]
        Btn["Sidebar Button (Above Settings)"]
        Modal["In-App Glassmorphic Modal"]
        Btn --> Modal
    end

    subgraph Sidecar Service (Node.js)
        CDP["CDP Bridge (127.0.0.1 DevTools)"]
        Vault["Session Vault (Windows Credential Manager)"]
        Poller["Official RPC Poller (GetUserStatus)"]
        Auto["Auto-Switch Engine (429 Listener)"]
    end

    CDP -->|Injects Button & Modal| DOM
    Poller -->|Fetch Quota & Reset Timers| AntigravityLS[Official Local RPC Server]
    Modal -->|Trigger Switch| Vault
    Vault -->|Atomic Swap & Soft Reload| DOM
    DOM -->|429 Rate Limit Detected| Auto
    Auto -->|Auto-Swaps to Best Account| Vault
```

---

## 🚀 Installation & Instant Updates

### Option 1: 1-Line npm / npx (Zero Clone Needed)

Install directly into Antigravity with a single command:
```bash
npx antigravity-account-switcher install
```

To update to the latest release with live hot-reload:
```bash
npx antigravity-account-switcher update
```

Check system status and live account health:
```bash
npx antigravity-account-switcher status
```

### Option 2: Clone from GitHub

1. Clone the repository:
   ```bash
   git clone https://github.com/omid-io/antigravity-account-switcher.git
   cd antigravity-account-switcher
   ```

2. Run the automated installer:
   ```bash
   npm run install-plugin
   ```
   *This links and installs the switcher directly into `~/.gemini/config/plugins/antigravity-account-switcher`.*

---

## 💻 CLI Usage

The package also includes a standalone CLI for headless operations:

```bash
# Display all accounts, live quotas, and countdown timers
npx antigravity-account-switcher list

# Switch to an account by email or ID
npx antigravity-account-switcher switch personal@gmail.com

# Snapshot the currently active session with a custom label
npx antigravity-account-switcher snapshot "Work Account"

# Check if newer updates are available
npx antigravity-account-switcher check-update

# Start the sidecar daemon manually
npx antigravity-account-switcher start
```

---

## 🛡️ Security & Human-Safety

- **100% Official Google Tokens:** The switcher works exclusively with official OAuth sessions generated by Antigravity's legitimate login flow.
- **Zero Network Man-in-the-Middle:** No traffic is routed through local proxies or custom servers.
- **Windows Credential Protection:** Sessions are stored using Windows `Advapi32.dll` Credential Manager standards.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
