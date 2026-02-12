# Axiom Sync

S3-focused sync plugin for Obsidian vaults.

Author: `moralex45`

## What It Does

- Syncs notes between local vault and S3-compatible storage
- Supports manual sync, dry-run, and scheduled sync
- Supports encryption and sync safety controls
- Includes RU/EN language switching in settings

## Install (Manual)

1. Build plugin:
```bash
npm run build2
```
2. Copy files into your vault plugin folder:
`<Vault>/.obsidian/plugins/axiom-sync/`
3. Required files:
- `main.js`
- `manifest.json`
- `styles.css`
4. In Obsidian: `Settings -> Community plugins -> Reload plugins`
5. Enable `Axiom Sync`

## Update (Manual)

1. Rebuild:
```bash
npm run build2
```
2. Replace plugin files in:
`<Vault>/.obsidian/plugins/axiom-sync/`
3. Reload plugins (or restart Obsidian)

## Release Checklist (Short)

1. Run `npm run build2` (must pass)
2. Verify `manifest.json`:
- `id = axiom-sync`
- `name = Axiom Sync`
3. Smoke-test in Obsidian:
- open settings
- run `Check Connectivity`
- run `Dry run`
4. Confirm RU/EN switching works in settings and first modal
5. Copy `main.js`, `manifest.json`, `styles.css` to target vault plugin folder
6. Reload plugins and verify plugin enables without errors
