# J.A.R.V.I.S. Bridge — security integration acceptance

## Verified in source
- Android uses the existing Cloud Worker HTTPS endpoint.
- Pairing creates a device credential and the Bridge polls for approved commands.
- Local health labels distinguish foreground-service startup from authenticated Cloud contact.
- Android 15 application launches, camera/microphone and file-scoped permissions require local authorization.
- Server command allowlists include approved app catalog and scoped files.

## This change
- Android claims can no longer override a device type chosen by the operator when creating a pairing session.
- Android APK CI now reacts to changes in the backend pairing and control allowlists as well as native code.
- The pipeline checks that approved commands appear in both client and backend before APK compilation.

## Acceptance checks required
1. Merge and run Android APK build from the intended commit; check artifact name, integrity, manifest and package signature.
2. On Android 15 with Play Protect enabled, install app, pair, start Bridge and verify that Cloud status reports a recent authenticated poll.
3. Test wrong pairing code and mismatched device type, plus device revocation/re-pairing.
4. Test approved app list and opening, including background notification acknowledgment instead of false opened status.
5. Test scoped file read after local 10-minute access/PIN, rejection outside the selected tree and immediate revocation.
6. Start camera and microphone locally, confirm no cloud-only start and verify the stop action.
7. Verify TV LAN pairing separately; do not relax cleartext networking globally.
8. Review all permissions and reject unexpected accessibility or all-files access warnings.

## Not yet proven
Passing CI means the sources compile and static assertions pass, not that Android behavior is validated in the user's physical phone. Do not disable Play Protect or promise unrestricted control of installed apps.
