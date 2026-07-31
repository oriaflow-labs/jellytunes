## JellyTunes 0.6.0 — Now on the Snap Store

Installing JellyTunes on Linux used to mean downloading an AppImage and hoping your distro let it run. This release fixes that. JellyTunes is on the Snap Store, the `.deb` works on Ubuntu 24.04, and AppImage steps back to legacy.

### What's new

**Install from the Snap Store.** One command, and updates arrive on their own from then on:

```
sudo snap install jellytunes
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
sudo snap install jellytunes
```

Syncing to USB and SD cards needs the `removable-media` interface. Most systems connect it automatically; if yours doesn't, JellyTunes tells you and gives you the command.

**`.deb`.** Download it from the assets below.

**AppImage (legacy).** Still available, but deprecated. See the [migration guide](docs/INSTALLATION.md).

---

### Installing on macOS

Download the `.dmg` below and drag JellyTunes into your Applications folder. macOS will block it the first time you open it, because the app isn't signed with an Apple Developer certificate.

On **Apple silicon** the wording is alarming — _"JellyTunes is damaged and can't be opened. You should move it to the Bin."_ **The download isn't damaged.** That's what macOS says about any quarantined app it can't verify. Click **Cancel**, not Move to Bin, then run:

```
xattr -cr /Applications/JellyTunes.app
```

Open the app normally afterwards. You'll need this once per install, including after updates.

On **Intel** you get the milder "unidentified developer" message, and you can either run the same command or click **Open Anyway** in **System Settings → Privacy & Security**.

---

Want the full technical breakdown? See the [CHANGELOG.md](CHANGELOG.md).
