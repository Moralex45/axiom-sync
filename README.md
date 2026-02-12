# Axiom Sync

Sync plugin for Obsidian vaults.

Author: `fyears`

## Features

- Sync notes between local vault and cloud storage backends.
- Manual sync, dry-run, and scheduled sync.
- Encryption and sync safety controls.
- RU/EN language switching in settings.

## Official Submission Disclosures

### Internet Access

This plugin requires internet access for sync operations with remote storage providers.

### External Services

The plugin connects only to services explicitly configured by the user, for example:

- S3-compatible endpoints
- WebDAV endpoints
- Dropbox
- OneDrive
- Webdis

The Pro module also supports additional providers (Google Drive, Box, pCloud, Yandex Disk, Koofr, Azure Blob Storage).

### Data and Privacy

- File content and metadata are transferred only to the configured storage provider.
- OAuth tokens and provider credentials are stored locally in Obsidian plugin data.
- The plugin does not include telemetry or analytics tracking.

### Commercial / Pro Features

- Core sync features are available without payment.
- Some Pro features require a paid account at `https://remotelysave.com`.
- This plugin and service are not affiliated with Obsidian.

## Manual Install

1. Build plugin:

```bash
npm run build2
```

2. Copy files to `<Vault>/.obsidian/plugins/axiom-sync/`:
- `main.js`
- `manifest.json`
- `styles.css`
3. In Obsidian: `Settings -> Community plugins -> Reload plugins`.
4. Enable `Axiom Sync`.

## Manual Update

1. Rebuild:

```bash
npm run build2
```

2. Replace files in `<Vault>/.obsidian/plugins/axiom-sync/`.
3. Reload plugins (or restart Obsidian).
