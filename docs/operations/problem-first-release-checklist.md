# Problem-first release checklist

Last local verification: **2026-11-06**

Branch: `codex/problem-first-ux-design`

Public Guest Preview status: **BLOCKED — keep `VITE_GUEST_PREVIEW_ENABLED=false` and `AI_SCANS_ENABLED=false` until every Production evidence item is signed off.**

This file records evidence without secrets. Never paste API keys, secret values, JWTs, CAPTCHA tokens, raw IP addresses, or screenshots containing them here.

## Local automated evidence

- [x] `npm test` — 25 files, 161 tests passed.
- [x] `npm run lint` — passed.
- [x] `npx tsc -p tsconfig.app.json --noEmit` — passed.
- [x] `npm run build` — passed. The existing bundle-size advisory is non-blocking release debt.
- [x] `npx supabase db reset` — every migration applied on a fresh local database.
- [x] `npx supabase test db` — 5 files, 194 pgTAP tests passed.
- [x] `npx supabase db advisors` — `No issues found` after `20261106233430_release_hardening.sql`.
- [x] Browser secret declaration removed: source contains no `VITE_GEMINI_API_KEY`; Gemini, service-role, network-HMAC, and Turnstile secret values remain server-only.

## Auth, grants, RLS, and storage matrix

Automated pgTAP coverage verifies the following local database behavior:

| Actor | Expected access | Local evidence |
| --- | --- | --- |
| Unauthenticated `anon` role | No permanent profiles, activities, completions, cases, plan steps, scans, private scan objects, private schema, or service RPCs | Passed |
| Anonymous Supabase user (`authenticated` role, `is_anonymous=true`) | Guest reservation only through the Edge service path; no permanent app data or plan/comparison transitions | Passed |
| Permanent user A | Own profile, activities, completions, scans, cases, plan steps, and safe allowance/usage rows only | Passed |
| Permanent user B | Cannot read or mutate user A data | Passed |
| `service_role` | Cost reservation/finalization/runtime RPCs and private counters used by the Edge Function | Passed |

Supabase documents that anonymous users receive the `authenticated` Postgres role, so the `is_anonymous` JWT check is mandatory—not optional defense in depth: [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Cost-failure matrix

The handler and database suites cover invalid JWT/API-key-only requests, wrong session kind, disallowed origin, trusted-address HMAC, missing trusted address, fourth network attempt, second guest preview, fourth welcome completion, pre-day-30 monthly use, 51st guest reservation, 101st total reservation, duplicate and simultaneous request IDs, provider timeout/unknown reconciliation, circuit opening, kill switch, oversized/invalid images, unusable images, finalization failure, and missing/partial usage metadata.

- [x] No tested pre-provider rejection invokes Gemini.
- [x] Duplicate/concurrent request IDs result in at most one provider call.
- [x] Provider/unusable failures retain global accounting but refund personal allowance as specified.
- [x] Unknown outcomes require a new manual request after the two-minute cooldown; there is no automatic browser retry.
- [x] Maximum output tokens remain 700 guest / 1,500 personalized-follow-up, with thinking disabled for the configured 2.5 models.
- [x] Application limits remain 50 guest calls/day, 100 total calls/day, and 3 guest attempts/network/24 hours.

## Current model and spend-cap review

Reviewed against official documentation on 2026-11-06:

- `gemini-2.5-flash-lite`: $0.10/M input and $0.40/M output tokens.
- `gemini-2.5-flash`: $0.30/M input and $2.50/M output tokens.
- Google documents enforced spend-cap budgets for the Gemini API service, with automatic 50/80/100% notifications. Enforcement uses estimated cost and is not instantaneous, so application controls remain mandatory: [Cloud Billing spend caps](https://cloud.google.com/billing/docs/how-to/budgets-spend-caps), [Gemini billing](https://ai.google.dev/gemini-api/docs/billing/).
- Official model guidance says access to 2.5 models may be limited for new projects. A real call from the dedicated project is therefore a release gate; do not assume the configured IDs are available.

## Production evidence — must be completed by the owner

- [ ] Dedicated Google Cloud project contains only My Lawn Gemini usage.
- [ ] Enforced monthly spend-cap budget is scoped to that one project and `generativelanguage.googleapis.com`, set at **$10 or lower**, and displays `Configured`.
- [ ] A monitored billing administrator/project owner confirmed delivery of 50%, 80%, and 100% alerts.
- [ ] The API key belongs to that dedicated project and exists only as the Supabase Edge secret `GEMINI_API_KEY`.
- [ ] The dedicated project successfully called the configured stable model IDs; if unavailable, replacements were evaluated, configured, contract-tested, and price-reviewed.
- [ ] Paid/free billing tier and provider use of submitted lawn photos were explicitly reviewed and accepted.
- [ ] Supabase production anonymous sign-ins remain disabled for Phase 0.
- [ ] Before Guest Preview: Turnstile is configured, Supabase CAPTCHA enforcement is enabled, and an anonymous sign-in without a CAPTCHA token fails. See [CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha).
- [ ] Before new-account conversion: manual identity linking is enabled and email verification is tested before password creation. See [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
- [ ] `APP_ALLOWED_ORIGINS` contains only `https://my-lawn.vercel.app` plus explicitly required local development origins.
- [ ] Vercel contains only browser-safe values: Supabase URL/publishable key, feature flags, and Turnstile site key. It contains no Gemini key, service/secret role key, HMAC secret, or Turnstile secret.

## Kill switch and controlled scan

Perform this only after the spend cap and project ownership are visibly confirmed:

1. Set `AI_SCANS_ENABLED=false` in Supabase Edge secrets.
2. Submit one controlled authenticated scan. Record timestamp and request ID only.
3. Confirm the browser receives the friendly unavailable state, no usage event reaches `started`, and provider usage does not increase.
4. Set `AI_SCANS_ENABLED=true`.
5. Submit exactly one controlled scan.
6. Confirm its event is `completed`, uses the expected model, has input/output/total token counts, and `usage_metadata_complete=true`.
7. Restore `AI_SCANS_ENABLED=false` until the actual launch decision.

- [ ] Disabled-path evidence recorded: date/time ______ request ID ______
- [ ] Enabled-path evidence recorded: date/time ______ request ID ______ model ______

## Journey and route smoke checks

Run on a Vercel preview built from the release commit at mobile and desktop widths:

- [ ] Guest Preview → conversion → minimal profile → personalized diagnosis → Start plan.
- [ ] Today action → check branch → postpone → follow-up photo → owner-confirmed outcome.
- [ ] Progress shows before/after evidence, completed steps, manual history, resolved plans, and calm maintenance state.
- [ ] Existing-account conversion preserves the local draft and never transfers anonymous database rows.
- [ ] Direct `/diagnose` and `/diagnose/convert` routes load Guest Preview/conversion when the feature flag is on.
- [ ] Direct `/auth/convert`, `/plan`, `/scan`, and `/progress` routes load the SPA and enforce permanent authentication.
- [ ] `/log` lands on `/progress#activity`; `/schedule` lands on `/plan#seasonal`.
- [ ] Browser console/network log shows no secret values and no automatic diagnosis retries.

Local browser automation could not reach the host localhost server from its isolated runtime, so it is not accepted as production visual evidence. The automated component/routing tests and build passed, but the real preview checks above remain open.

## Rollback and emergency response

If spend, abuse, auth, or diagnosis behavior is unexpected:

1. Set `AI_SCANS_ENABLED=false` immediately.
2. Set `VITE_GUEST_PREVIEW_ENABLED=false` and redeploy if Guest Preview is public.
3. Inspect usage events, daily counters, runtime circuit state, AI Studio usage, and the spend-cap status.
4. Revoke/replace the Gemini key in the same capped project if exposure is suspected.
5. Roll Vercel back to the last known-good deployment; do not roll database migrations backward destructively. Ship an additive corrective migration.
6. Re-enable only after the cause is fixed, the complete automated suite passes, and one controlled scan is reconciled.

## Release decision

- [ ] All production evidence and smoke checks are complete.
- [ ] Owner sign-off: ______  Date: ______
- [ ] Release commit: ______  Vercel deployment: ______

Until all three boxes are complete, the product is **not cleared for public Guest Preview**.
