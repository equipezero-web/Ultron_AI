# J.A.R.V.I.S. Android Bridge v0.9.1 — security changes and test plan

This release changes the on-device permission model; it is **not** an independent security certification.

## Device controls

- **No Accessibility service** or “all files” access request. Do not bypass Play Protect warnings.
- **Remote files:** Android's `ACTION_OPEN_DOCUMENT_TREE` selects one directory. Only documents in that user-approved subtree are available to remote `files.list` and `files.read`; sessions require an 8-digit HMAC PIN, expire after 10 minutes, and can be revoked from the phone. No remote writes/deletes or permanent access. Switching folders invalidates prior PINs.
- **Installed applications:** Only apps explicitly approved by the phone operator appear in cloud inventory. Opening any app requires local approval; the bridge sends a notification instead of claiming a background launch on Android 15.
- **Camera/microphone:** Cloud requests do not silently start a new recording session. The user must initiate the session from the phone and can stop it locally. Re-pairing revokes active sessions.
- **Server:** `app.list` is restricted to a paired mobile device and the authenticated operator. App inventory is consumed from the command history on read; file chunks are similarly consumed.
- **Transport:** cleartext HTTP is disabled by default. LAN integrations (e.g., some TV protocols) require separate device testing.

## Validation checklist (before a public install)

1. GitHub Actions: run `tests/jarvis-bridge-ui-security.mjs` and compile the APK.
2. Inspect merged manifest and APK permissions. Verify no Accessibility / MANAGE_EXTERNAL_STORAGE / READ_EXTERNAL_STORAGE requests.
3. Install or update on Android 15. Confirm Play Protect result **without disabling it**.
4. Pair a phone and check device status. Approve YouTube, Gmail or another launcher app locally; check app catalog and open via voice/UI.
5. In background, verify a launch returns notification/tap status, not false “opened” confirmation.
6. Select a single folder. Test read/list, unauthorized other paths, PIN failures, 10-minute expiration, immediate revoke, and re-pairing.
7. Verify camera and mic do not activate from cloud without a fresh local session; test pause/resume and local stop.
8. Test LG TV / other LAN controls separately after cleartext transport restriction.

A successful APK build verifies compilation, **not** runtime behavior or Play Protect approval.
