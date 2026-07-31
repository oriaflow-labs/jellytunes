## JellyTunes 0.6.0 — Now on the Snap Store

Installing JellyTunes on Linux used to mean downloading an AppImage and hoping your distro let it run. This release fixes that. JellyTunes is on the Snap Store, the `.deb` works on Ubuntu 24.04, and AppImage steps back to legacy.

### What's new

**Install from the Snap Store.** One command, and updates arrive on their own from then on:

```
sudo snap install jellytunes
```

**The `.deb` works on Ubuntu 24.04.** It shipped without an AppArmor profile, which meant the app refused to launch on 24.04 and left you staring at a sandbox error. The profile is now included and enabled, and the package metadata is complete.

**AppImage is deprecated.** It still runs today, but Ubuntu 24.04+ can block the sandbox Electron relies on, and that is not something we can fix from our side. If you're on the AppImage, the [migration guide](https://github.com/orainlabs/jellytunes/blob/main/docs/INSTALLATION.md) walks you through moving to Snap or `.deb`.

### Also fixed

- The devices and folders list in the sidebar scrolls again on short windows and small screens
- The version update check no longer throws when the server answers with something unexpected
- FFmpeg binaries are pinned per platform, so conversion behaves the same on every machine

---

### Installing

Full instructions for every platform live in the [installation guide](https://github.com/orainlabs/jellytunes#installation). That page is kept current, so check it there rather than here if something doesn't work.

**macOS: read this before you open the app.** JellyTunes isn't signed with an Apple Developer certificate, and on Apple silicon macOS reports that as _"JellyTunes is damaged and can't be opened. You should move it to the Bin."_ The download is not damaged. Click Cancel, drag the app into your Applications folder, then run:

```
xattr -cr /Applications/JellyTunes.app
```

**Linux: install from the Snap Store**, not from the assets below. The `.snap` isn't attached on purpose, because a file downloaded from GitHub carries no store signature and `snap install` rejects it. The `.deb` is in the assets, and so is the AppImage (legacy), which still runs but is deprecated.

---

Want the full technical breakdown? See the [CHANGELOG.md](https://github.com/orainlabs/jellytunes/blob/main/CHANGELOG.md).
