# Linux installation

JellyTunes has two maintained Linux packages. AppImage is still published, but it is legacy and on its way out.

| Package | Status | Best for |
| --- | --- | --- |
| **Snap** | Recommended (stable channel) | Most users. Automatic updates, sandboxed. |
| **`.deb`** | Supported | Debian/Ubuntu users who prefer apt, or anyone hitting the keyring issue below. |
| **AppImage** | Legacy, deprecated | Existing users only. Migrate when you can. |

FFmpeg is bundled with both the `.deb` and Snap packages.

## Snap (recommended)

```bash
sudo snap install jellytunes
```

Syncing to USB drives and SD cards needs the `removable-media` interface. If your system did not connect it automatically, run:

```bash
sudo snap connect jellytunes:removable-media
```

JellyTunes checks its own interfaces at startup and tells you in-app if one is missing, along with the command to fix it.

Updates are handled by the Snap Store, so the Snap build does not show the app's manual update banner.

### If JellyTunes asks you to log in every launch

Under Snap, your session is stored through your desktop's Secret portal. A few desktops ship without a working portal backend, and when that happens JellyTunes cannot save the session. The app will tell you directly, and you will have to log in again on each launch.

This is a host desktop configuration problem, not a Snap confinement one, so connecting extra interfaces will not help. **Install the `.deb` instead** — it runs unconfined and is unaffected.

Confirmed working on Ubuntu 26.04. Confirmed broken on Zorin OS 18. Details land in the app log at `~/snap/jellytunes/current/.config/JellyTunes/logs/` under `secret-tool` entries.

## `.deb`

Download the `.deb` asset from the [latest release](https://github.com/orainlabs/jellytunes/releases/latest), then:

```bash
sudo apt install ./jellytunes_<version>_amd64.deb
```

No interface connections needed.

## AppImage (legacy)

**AppImage is deprecated. New installations should use Snap or `.deb`.**

On Ubuntu 24.04 and later it may refuse to start, because Ubuntu restricts the user namespace sandbox that Electron depends on. This cannot be fixed reliably from a user-mounted AppImage without system-level AppArmor changes.

Do not work around it with `--no-sandbox`. That removes a real security boundary and is not supported.

### Removal timeline

The AppImage target will be removed no earlier than **2026-10-01**, and only once the Snap has passed a clean Ubuntu 24.04+ smoke test covering launch and USB/SD sync, and the `.deb` keeps building in the release pipeline. Until then, release pages label it **legacy** and link back to this guide.
