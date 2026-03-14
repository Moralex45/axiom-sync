# Axiom Sync

> Sync Obsidian vaults with S3-compatible storage or Telegram.
> Built for people who want control, transparency, and provider freedom.

Author: `aamorozovv`

## Features

- S3-compatible sync target
- Telegram Bot storage target (experimental)
- Manual sync
- Scheduled sync
- Sync on save
- Dry-run support
- Path allow/ignore filters
- Optional encryption for remote data
- Import/export of settings

## Compatibility

- Desktop only

## Security and privacy

- Network access is used only for the remote service you configure.
- Vault content and metadata are sent only to the configured remote backend.
- Provider credentials are stored in local Obsidian plugin data.
- The plugin does not include built-in client-side telemetry or analytics.

## Community plugin disclosures

### Internet access

Required for synchronization and connectivity checks against configured remote services.

### External services

- User-configured S3-compatible endpoints
- Telegram Bot API
- [axiom-sync.com](https://axiom-sync.com) only if the user chooses paid account-based features

### Accounts and payments

- Core sync features are available without payment and without an account.
- Some optional Pro features may require an account and payment at [axiom-sync.com](https://axiom-sync.com).
- This project is independent and is not affiliated with Obsidian.

## Manual install

1. Build the plugin:

```bash
npm run build2
```

2. Copy these files into `<Vault>/.obsidian/plugins/axiom-sync/`:

- `main.js`
- `manifest.json`
- `styles.css`

3. In Obsidian, go to `Settings -> Community plugins -> Reload plugins`.

4. Enable `Axiom Sync`.

## Manual update

1. Rebuild the plugin:

```bash
npm run build2
```

2. Replace `main.js`, `manifest.json`, and `styles.css` in `<Vault>/.obsidian/plugins/axiom-sync/`.

3. Reload plugins or restart Obsidian.

## Development

```bash
npm install
npm run dev2
```

Build and type-check:

```bash
npm run build2
```

Run tests:

```bash
npm test
```

## Design intent

Your notes stay yours. Axiom Sync is meant to be a transport layer, not a walled garden.
