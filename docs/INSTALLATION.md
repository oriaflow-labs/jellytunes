# Linux installation and AppImage migration

JellyTunes supports two maintained Linux channels:

- **Snap (recommended):** sandboxed by Snap, updated automatically through the Snap Store.
- **`.deb`:** native Debian/Ubuntu package for users who prefer apt-managed installation.

## AppImage deprecation

**AppImage is deprecated.** The AppImage target is kept temporarily as a legacy channel while the Snap Store release completes its validation and rollout. On Ubuntu 24.04 and later, the AppImage may fail to start because Ubuntu restricts the user namespace sandbox that Electron needs. This cannot be fixed reliably from a user-mounted AppImage without manual system-level AppArmor changes.

Do not disable Electron's sandbox with `--no-sandbox`. That weakens the security boundary and is not a supported workaround.

New Linux installations should use Snap or `.deb`. Existing AppImage users should migrate before the legacy target is removed.

## Migrate to Snap (recommended)

Install JellyTunes from the Snap Store:

```bash
sudo snap install jellytunes --beta
```

JellyTunes uses strict confinement. The interfaces needed for USB/SD sync are not auto-connected by Snap, so connect them once after installation:

```bash
sudo snap connect jellytunes:removable-media
sudo snap connect jellytunes:hardware-observe
```

Session encryption is attempted via `secret-tool` (the libsecret CLI), with Electron's `safeStorage` as the fallback. No `password-manager-service` connection is needed.

> **Known issue — session persistence under Snap.** Whether `secret-tool` actually reaches the keyring inside strict confinement has not yet been confirmed on a clean install. Two things are unresolved: the snap does not currently stage `libsecret-tools`, so the `secret-tool` binary may be absent altogether, and the portal-routing behaviour under AppArmor is unverified. If you see "sessions will not persist", or you are asked to log in again after every restart, that is this issue. The `.deb` package is unaffected. Diagnostics land in the app log (`~/snap/jellytunes/current/.config/JellyTunes/logs/`) as `secret-tool` records carrying an `operation` and a `stderrClassification`.

The Snap Store manages application refreshes automatically. The app's manual release-update banner is therefore not used by the Snap build.

FFmpeg is bundled with both the `.deb` and Snap packages, so no separate FFmpeg installation is required.

## Migrate to `.deb`

Download the `.deb` asset from the [latest GitHub release](https://github.com/orainlabs/jellytunes/releases/latest), then install it with:

```bash
sudo apt install ./jellytunes_<version>_amd64.deb
```

The `.deb` package is the native Ubuntu/Debian option and does not require the Snap interface connections above.

## Legacy AppImage policy

The AppImage remains available only to avoid an abrupt migration for existing users. The `AppImage` target will be removed no earlier than **2026-10-01**, and only after both conditions are met:

1. The Snap build has passed the clean Ubuntu 24.04+ smoke test, including launch and USB/SD sync, and is published to the Snap Store's **stable** channel.
2. The `.deb` package continues to build successfully in the release pipeline.

Until then, release pages label AppImage as **legacy** and link back to this guide. If Ubuntu 24.04 blocks an existing AppImage installation, migrate to Snap or `.deb` instead of applying an AppArmor profile tied to a file path.
