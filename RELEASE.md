# Release Process

How to ship a new JellyTunes version, end to end.

## 1. Prepare the release

Before bumping the version:

- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] Working tree is clean and you're on `main`
- [ ] `CHANGELOG.md` has an entry for the new version
- [ ] `RELEASE_NOTES.md` is rewritten for the new version — it is used **as-is** as the GitHub Release body (`body_path: RELEASE_NOTES.md` in the release workflow), so it must already describe the version you're about to tag, not the previous one
- [ ] `RELEASE_NOTES.md` links to the installation instructions instead of restating them. The file is rewritten every release, so any steps copied into it are a fresh chance to drift from the README, and a published release body can only be corrected by hand
- [ ] Links in `RELEASE_NOTES.md` that point at repo files are absolute URLs to `main`. GitHub resolves relative links in a release body against the tag (`/blob/v0.6.0/docs/...`), which freezes them at that version, so later fixes to the docs never reach the release page

## 2. Bump and tag

```bash
pnpm release <patch|minor|major>
```

This runs `scripts/release.sh`, which:

1. Aborts if the working tree isn't clean or you're not on `main`
2. Bumps `package.json` version (`npm version --no-git-tag-version`)
3. Commits `chore: bump version to X.Y.Z`
4. Creates annotated tag `vX.Y.Z`
5. Pushes `main` and the tag to `origin`

## 3. CI takes over

Pushing a `v*` tag triggers `.github/workflows/release.yml`:

- Builds in parallel: macOS (arm64 + x64), Windows x64, Linux x64, via `electron-builder`
- Linux also runs `snapcraft upload --release=beta` — publishes to the **beta** channel only, never straight to stable
- `publish-release` job downloads all build artifacts, verifies `.dmg`, `.exe`, `.AppImage`, and `.deb` are all present (refuses to publish a partial release if any are missing), and attaches them to the GitHub Release with `RELEASE_NOTES.md` as the body

The `.snap` is intentionally **not** attached to the GitHub Release — a `.snap` grabbed off GitHub has no store assertion, so `snap install` rejects it without `--dangerous`. Snap distribution goes through the Snap Store only.

## 4. Manual steps after CI

These are not automated on purpose:

- **Promote the snap from `beta` to `stable`**:

  ```bash
  snapcraft release jellytunes <revision> stable
  ```

  This is a deliberate human gate — a snap can build green and still fail at launch or hit AppArmor denials at runtime, and there's no CI runtime smoke test yet (tracked in ORAIN-0582).

- **Update the Snap Store listing by hand** if user-facing copy (title, summary, description) changed. Editing the listing via the web dashboard set `update_metadata_on_release` to `false`, so uploading a new revision no longer updates the store listing from `package.json`. See the "Snap Store Listing" section in `CLAUDE.md` for the full explanation of what lives where.

- **Watch `SNAPCRAFT_STORE_CREDENTIALS`**: it's channel-scoped and expires (1 year by default, generated via `snapcraft export-login --channels=beta,candidate,stable -`). If a release goes green but nothing shows up in the Snap Store, this is the first thing to check.

## Reference

| File                            | Role                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `scripts/release.sh`            | Version bump, commit, tag, push                              |
| `.github/workflows/release.yml` | Build matrix, Snap Store beta upload, GitHub Release publish |
| `CHANGELOG.md`                  | Full technical changelog, hand-maintained                    |
| `RELEASE_NOTES.md`              | User-facing release notes, becomes the GitHub Release body   |
| `CLAUDE.md`                     | Snap Store listing drift explanation                         |
