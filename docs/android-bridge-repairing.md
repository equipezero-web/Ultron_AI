# Bridge Android — re-pairing identity isolation

On every new pairing attempt, the Android client generates a fresh random 256-bit device secret in memory. It sends the candidate to the existing authenticated pairing endpoint and stores it in encrypted Android Keystore-backed preferences only after the server returns a new device ID.

This applies to both MainActivity and JarvisMobileActivity, and avoids reusing the old device credential on a new operator pairing. A failed pairing retains the old locally stored credential.

**Important:** This does not revoke an existing server-side pairing. If a device moves between owners/accounts, the old owner should explicitly revoke the previous device in the authenticated account/device manager. Until that server-side revocation, a prior credential may remain valid elsewhere if compromised. Do not claim automatic server revocation.

Validation: Android CI source contracts and APK compilation, then physical Android 15 pairing, failed pairing, network disconnect, re-pair, previous-credential rejection after server revocation, Play Protect without bypass.
