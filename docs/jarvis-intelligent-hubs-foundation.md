# J.A.R.V.I.S. intelligent hubs: implementation boundary

## Existing components preserved
- Current mission orchestration and P0/P5 priority layer remain in place.
- D1 memory, research cache, Neural Ring, world globe and Android Bridge were not replaced.
- This increment adds no third-party code or runtime dependencies.

## New foundations
1. `backend/skill-hub.js`: operator-scoped declarative skill version registry in D1; only fixed read-only capabilities accepted. Registration produces draft; status promotion is separate and requires explicit validated/approved flags.
2. `backend/intelligent-task-hub.js`: deterministic advisory routing to seven specialist profiles, tool allowlists, cancellation and bounded concurrency of up to three. Agent implementations must be explicitly supplied by the caller; unavailable agents are reported, not simulated.
3. `backend/trajectory-hub.js`: operator-scoped D1 execution evidence, capped fields with no raw messages or tool outputs, read/list and operator-specific retention deletion.
4. `modules/ultron-orchestrator-v4270.js`: shows an advisory multi-agent plan for compound intents. It **does not yet dispatch** tool-running specialist agents. Existing mission safety still governs execution.
5. `tests/jarvis-intelligent-hubs.mjs` and CI workflow: regression checks for strict skill allowlists, plans, cancellation and sanitized audit records.

## Important limitations and next integration work
- Operator-scoped, read-only POST endpoints now expose `/api/hubs/plan`, `/api/hubs/skills` and `/api/hubs/trajectories`. They reuse the existing memoryKey-derived operator identity, which is not a substitute for a stronger server-authenticated session model. No HTTP route can register, validate, activate or execute skills.
- D1 persistence requires the existing `ULTRON_DB` binding; database operations require deployed environment integration testing.
- Skill validation currently checks specification shape, not the observed success of a real-world procedure.
- These agents are routing profiles, not independent language models. Provider selection and multimodal generation remain in the existing system.
- Tasks such as payments, deleting private files, sending data and switching security settings are intentionally absent from approved tools.
- No new Android permissions or accessibility control were added.
- Physical Android 15 camera, notifications, files and app-control verification is still necessary.

## Recommended production acceptance sequence
1. Review and merge PR only after all relevant CI passes and checks for access-control weaknesses.
2. Configure authenticated server endpoints for skill drafts, locally verified validation, explicit activation and revocation; never trust an approval Boolean supplied by a browser.
3. Add server-validated operator scoped trajectory writes on real orchestrated steps.
4. Connect approved agent adapters to existing weather/research/device-read APIs; verify results and show status in Neural Ring.
5. Extend with semantic embeddings behind privacy and cost controls, and safe visual/touch controls.
6. Test with browser, Android 15, device permissions, Cloudflare D1 and P0 stop before production deployment.

Architecture references are design inspiration only, not copied source code.
