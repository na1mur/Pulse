# Release checklist

Use this when publishing a new version to [GitHub Releases](https://github.com/mohammad-naimur-rahman/Pulse/releases).

## 1. Bump version

Update version in:

- `package.json` (root)
- `apps/api/package.json`
- `apps/desktop/package.json`
- `apps/mobile/package.json` and `apps/mobile/app.json`
- `packages/*/package.json`
- Settings screens (desktop + mobile "About" section)

## 2. Build artifacts

### Windows installer

```sh
pnpm desktop:dist:win
```

Upload: `apps/desktop/release/Pulse Setup <version>.exe`

### Android APK

```sh
pnpm mobile:build:android
```

Upload: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

## 3. Create GitHub release

1. Tag the commit: `git tag v0.0.5 && git push origin v0.0.5`
2. Go to **Releases → Draft a new release**
3. Choose the tag, title (e.g. `v0.0.5`), and write release notes
4. Attach the Windows installer and Android APK
5. Publish

## Release notes template

```markdown
## What's new

- Brief list of changes

## Downloads

| Platform | File                    |
| -------- | ----------------------- |
| Windows  | `Pulse Setup X.X.X.exe` |
| Android  | `app-release.apk`       |

## Self-hosting

See [Self-hosting guide](docs/SELF_HOSTING.md) to run your own backend.
```
