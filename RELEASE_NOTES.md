## JellyTunes 0.6.0 — Now on the Snap Store

Installing JellyTunes on Linux used to mean downloading an AppImage and hoping your distro let it run. This release fixes that. JellyTunes is on the Snap Store, the `.deb` works on Ubuntu 24.04, and AppImage steps back to legacy.

### What's new

**Install from the Snap Store.** One command, and updates arrive on their own from then on:

```
snap install jellytunes --beta
```

**The `.deb` works on Ubuntu 24.04.** It shipped without an AppArmor profile, which meant the app refused to launch on 24.04 and left you staring at a sandbox error. The profile is now included and enabled, and the package metadata is complete.

**AppImage is deprecated.** It still runs today, but Ubuntu 24.04+ can block the sandbox Electron relies on, and that is not something we can fix from our side. If you're on the AppImage, the [migration guide](docs/INSTALLATION.md) walks you through moving to Snap or `.deb`.

### Also fixed

- The devices and folders list in the sidebar scrolls again on short windows and small screens
- The version update check no longer throws when the server answers with something unexpected
- FFmpeg binaries are pinned per platform, so conversion behaves the same on every machine

---

### Installing on Linux

**Snap (recommended).** The `.snap` isn't attached to this release on purpose. Install it from the Store instead, since a manually downloaded file won't carry the Store's signature:

```
snap install jellytunes --beta
```

Sync to USB and SD cards needs a couple of Snap interfaces connected. Most systems handle this automatically; if yours doesn't, JellyTunes tells you which one is missing and the exact command to run.

**`.deb`.** Download it from the assets below.

**AppImage (legacy).** Still available, but deprecated. See the [migration guide](docs/INSTALLATION.md).

---

Want the full technical breakdown? See the [CHANGELOG.md](CHANGELOG.md).
