# Secrets and signing keys

Where every secret and signing key for Pulse lives, who may touch it, and what to do if one is lost or leaked. Nothing listed here is ever committed, and agents never create, rotate or upload keys (owner only). Agent-side protection: `guard-edit.js` blocks writes to these files and the settings deny rules block reading them with the file tools; reading them through shell commands (`cat .env`) is not checked, so agents must not do it.

Status: plan, 2026-10-24 (A6.3); server secrets from the PRD's `.env` list added 2026-10-24. Fill in the concrete locations when T0.3 (CI), T1.3 (deployment) and T7.6/T7.7 (releases) set them up.

## Inventory

| Secret | Used by | Lives in | Backup | If lost | If leaked |
|---|---|---|---|---|---|
| Server database password | server, compose | self-host `.env` on the server; CI secret for integration tests (throwaway value) | owner's password manager | reset in PostgreSQL | rotate, restart server |
| `JWT_SECRET` (signs access tokens) and `REFRESH_SECRET` (HMAC key for refresh-token hashes) | server | server `.env` | password manager | rotate: every device signs in again | rotate immediately |
| `GOOGLE_CLIENT_SECRET` (Google sign-in, AUTH-11) | server | server `.env` | password manager; the Google Cloud console can reissue it | create a new secret in the console | delete it in the console, create a new one, restart the server |
| `SMTP_APP_PASSWORD` (Gmail app password for verification and reset emails, OPS-07) | server | server `.env` | none needed (reissue) | create a new app password | revoke it in the Google account, create a new one |
| `FCM_*` service-account key (push, NOTIF-04; optional) | server | server `.env` | none needed (reissue) | create a new key in the Firebase console | delete the key in the console, create a new one |
| Tauri updater private key + password | Windows release builds (DESK-06) | CI secret | password manager + offline encrypted copy | existing installs can no longer auto-update (they trust only the public key built into them); users must install a new version manually | Tauri cannot revoke keys: ship one last update signed with the old key that contains the new public key, then sign with the new key; until then an attacker holding the old key could sign updates |
| Windows code-signing certificate | Windows installer | CI secret (or cloud signing service) | per provider | buy or reissue a certificate | revoke with the issuer |
| Android release keystore + passwords | APK signing (MOB-05) | CI secret (base64) | password manager + **two offline encrypted copies** | **existing installs cannot update; every user must uninstall and reinstall** | users can be served a malicious update: rotate with APK Signature Scheme v3 (Android 9+, needs the old key; disable the old key's rollback capability so it can no longer sign updates), warn users |
| GitHub token for releases | CI | GitHub Actions built-in `GITHUB_TOKEN` (expires when the job ends); a personal access token only if one becomes necessary | - | - | built-in token: nothing to do; personal token: revoke it |
| Legacy hosted-database credentials | legacy API (spec Appendix C) | owner's old local env file | - | - | rotate if that folder was ever shared |

Not secret, but tied to the Android signing key: the Google sign-in OAuth client for Android and the Firebase app are registered with the release key's SHA-1/SHA-256 fingerprints, so a new signing key also means updating both (spec section 11). The Android `google-services.json` holds public identifiers only and may be committed once the project exists.

## Rules

- **Repo:** never. `.gitignore` (for humans), `guard-edit.js` and the settings Read deny rules (for agents) cover the set defined once in `.claude/hooks/lib/secrets.js` (the Read deny rules are slightly stricter: they also block reading `.env` templates): `.env*` (except templates), keystores, certificates, private keys, SSH/GPG keys, signing properties and `secrets/`. Templates (`.env.example`) document variable names with fake values.
- **CI:** secrets only as GitHub Actions secrets, exposed only to the release jobs that need them, never echoed; pull requests from forks get none, and no workflow uses `pull_request_target` together with a checkout of the pull request's code.
- **Agents:** may reference secret names (e.g. `ANDROID_KEYSTORE_BASE64`) in workflows, never values; anything needing a real secret is handed to the owner with exact steps (see `devops-engineer`).
- **Backups:** the Android keystore and the updater key are irreplaceable for existing installs: keep at least two offline encrypted copies in different places, and test restoring them once a year.
- **Rotation:** server secrets yearly or on any suspicion; signing keys only when compromised (rotation is disruptive for users).

## Recovery checklist (owner)

1. Identify the secret from the table and whether it is lost or leaked.
2. Leaked: revoke or rotate first, then investigate.
3. Update the CI secret and any server `.env`, then re-run the affected release or deploy.
4. Record what happened and what changed in an ADR or the ledger notes.
