# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Jellysync is an Electron + React desktop app that syncs music libraries from a Jellyfin media server to portable devices (USB drives, SD cards). It handles selective sync, format conversion (FLAC→MP3 via FFmpeg), and preserves the server's folder structure on the destination device.

## Commands

```bash
# Development
pnpm dev              # Start dev server + Electron
pnpm build            # Compile with electron-vite
pnpm typecheck        # TypeScript type checking

# Testing
pnpm test             # Run unit tests (Vitest)
pnpm test:unit:watch  # Unit tests in watch mode
pnpm test:bdd         # BDD tests headless (Cucumber + Playwright)
pnpm test:bdd:dev     # BDD tests with visible UI

# Packaging
pnpm package          # Build + create installers
```

To run a single test file: `pnpm vitest run src/sync/sync.test.ts`

## Architecture

The app has three Electron processes plus a shared sync module:

**Main process** (`src/main/index.ts`) — IPC handlers for USB detection, file dialogs, and sync orchestration. Registers handlers like `sync:start2`, `usb:list`, `dialog:selectFolder`.

**Preload** (`src/preload/index.ts`) — IPC bridge that exposes a typed `api` object to the renderer. This is the contract between main and renderer.

**Renderer** (`src/renderer/src/App.tsx`) — Single large React component handling library navigation (artists/albums/playlists), device selection, and sync UI with progress tracking.

**Sync module** (`src/sync/`) — Standalone, testable sync engine with dependency injection:
- `sync-core.ts` — Main orchestrator that drives the sync phases (fetching → copying → converting → validating → complete)
- `sync-api.ts` — Jellyfin HTTP client (uses `/Items`, `/Items/{id}/Download`, `/Playlists/{id}/Items`)
- `sync-config.ts` — Config validation and `buildDestinationPath()` path construction
- `sync-files.ts` — File system and FFmpeg audio conversion operations
- `sync-progress.ts` — `ProgressEmitter` and `CancellationController`
- `types.ts` — All shared types (`SyncConfig`, `SyncInput`, `SyncProgress`, `SyncResult`, etc.)

The sync module uses dependency injection: `SyncCore` accepts `{ api, fs, converter }` interfaces, making it fully testable with mocks without touching the real filesystem or network.

## Key Jellyfin API Notes

- Artist IDs from Jellyfin don't directly map to album artist IDs — use `/Items?ParentId=` to fetch albums under an artist
- Playlists require `Fields=Path` query param to get track file paths
- Track downloads use `/Items/{id}/Download` with API key auth, not local file copy
- See `docs/JELLYFIN_API.md` for detailed endpoint research

## Path Handling

The sync module preserves the server's folder structure on the destination device. `serverRootPath` (auto-detected from common prefix of track paths) is stripped from each track's server path before joining with `destinationPath`. Path traversal (`..`) is explicitly blocked in `buildDestinationPath()`.

## Testing Strategy

- **Unit tests** live alongside source in `src/sync/*.test.ts` and also in `tests/unit/`
- **BDD tests** use Cucumber + Playwright in `tests/bdd/` — feature files in `tests/bdd/features/`, step definitions in `tests/bdd/steps/`
- BDD HTML reports are generated at `tests/bdd/reports/cucumber-report.html`
