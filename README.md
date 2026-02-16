# AXIOM SYNC

> High-reliability vault synchronization for Obsidian.
> Built for people who want control, transparency, and provider freedom.

Author: Aleksandr Morozov

---

## Why Axiom Sync

Axiom Sync is a sync engine for Obsidian vaults that keeps your notes portable across storage providers.
You choose where data lives. You choose how it is protected.

- Local-first workflow with remote replication
- Multi-provider architecture (no hard lock-in)
- Safety-first sync controls (dry-run, conflict handling, explicit settings)
- Optional encryption layer for data at rest on remote

---

## Capability Matrix

### Core Providers

- S3-compatible endpoints
- Telegram Bot storage (experimental)

### Sync Controls

- Manual sync
- Dry-run mode
- Scheduled sync
- Conflict action configuration
- Encryption method selection

---

## Security + Privacy

- The plugin uses network access only to communicate with the provider(s) you configure.
- File content and metadata are sent only to your selected remote backend.
- OAuth tokens and provider credentials are stored in local Obsidian plugin data.
- No built-in telemetry or analytics tracking.

---

## Official Submission Disclosures

### Internet Access

Required for synchronization with remote services.

### External Services

Connections are made only to user-configured S3-compatible endpoints or Telegram Bot API.

### Commercial / Pro Features

- Core features are available without payment.
- Some Pro capabilities require a paid account at [axiom-sync.com](https://axiom-sync.com).
- This project is independent and not affiliated with Obsidian.

---

## Quick Start (Manual Install)

1. Build the plugin:

```bash
npm run build2
```

2. Copy build artifacts into:

```text
<Vault>/.obsidian/plugins/axiom-sync/
```

Required files:

- `main.js`
- `manifest.json`
- `styles.css`

3. In Obsidian, reload community plugins:

```text
Settings -> Community plugins -> Reload plugins
```

4. Enable `Axiom Sync`.

---

## Manual Update

1. Rebuild:

```bash
npm run build2
```

2. Replace `main.js`, `manifest.json`, and `styles.css` in:

```text
<Vault>/.obsidian/plugins/axiom-sync/
```

3. Reload plugins (or restart Obsidian).

---

## Development

```bash
npm install
npm run dev2
```

Build + type-check:

```bash
npm run build2
```

Run tests:

```bash
npm test
```

---

## Design Intent

This project is designed around one principle:

**Your notes stay yours. Axiom Sync should be a transport layer, not a walled garden.**
