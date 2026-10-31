# Problem-First Lawn Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn My Lawn into a cost-bounded, problem-first coach that gives one Guest Preview, converts it into one primary personalized rescue plan, guides one action at a time, and proves improvement with follow-up scans.

**Architecture:** Keep the existing Vite/React, React Query, Supabase Auth/Postgres/Storage, and Supabase Edge Function stack. Add a server-enforced AI request ledger and atomic guardrail RPCs, a versioned diagnosis contract shared by browser and Edge code, a single-primary-case plan model, and focused feature modules behind four user destinations: Today, Plan, Scan, and Progress. Ship the work in four independently testable phases so cost safety protects the current app before any anonymous traffic is enabled.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, TanStack React Query, Supabase Auth/Postgres/RLS/Storage/Edge Functions, Deno-compatible TypeScript, Gemini API, Zod where browser-only validation is useful.

**Spec:** `docs/superpowers/specs/2026-10-31-problem-first-lawn-coach-design.md`

**Current Supabase references (re-check at implementation time):** [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [CAPTCHA Protection](https://supabase.com/docs/guides/auth/auth-captcha), [Local CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows), [Database testing](https://supabase.com/docs/guides/database/testing), and the [2026 Data API exposure breaking change](https://supabase.com/changelog?types=breaking-change).

## Global Constraints

- Public Guest Preview stays disabled until the dedicated Gemini project has a verified **$10 monthly spend cap** or enforceable equivalent.
- Default server limits are **100 total Gemini calls per UTC day**, **50 Guest Preview calls per UTC day**, and **3 Guest Preview attempts per normalized network address per rolling 24 hours**.
- Guest Preview uses a supported Flash-Lite model; personalized and follow-up diagnosis use a supported Flash model. Verify stable identifiers and prices at implementation time.
- Gemini thinking is disabled initially; Guest Preview output is capped at 700 tokens and personalized/follow-up output at 1,500 tokens.
- Every logical scan has a unique idempotency key and each identity may have only one in-flight diagnosis.
- Images are validated server-side at no more than 3 MB decoded and 1,600 pixels on the longest side.
- One anonymous Guest Preview is separate from three personalized welcome scans during the first 30 days. One personalized scan is replenished per 30-day period afterward.
- Failed, rejected, unusable, globally blocked, or circuit-broken requests do not consume personal allowance; every actual upstream call counts toward global cost limits.
- A permanent account may have only one primary `active` or `monitoring` rescue plan. Switching explicitly pauses the current plan.
- Diagnosis is product-neutral and uses confidence/evidence rather than a numeric lawn-health score.
- V1 has in-app reminders only. No email, SMS, push, billing, multiple lawns, multiple concurrent plans, brands, affiliate links, or arbitrary daily streaks.
- Database changes are additive, every exposed table has ownership-based RLS, and existing scans, activities, task completions, profiles, and private storage remain readable.
- Create migrations with `supabase migration new`; do not invent migration timestamps.
- Keep the Gemini secret and Supabase service-role credentials server-only.
- Supabase platform notes verified 2026-10-31: anonymous users use the `authenticated` Postgres role and must be distinguished with the trusted `is_anonymous` claim; CAPTCHA is enforced when `signInAnonymously` receives its token; manual identity linking must be enabled for anonymous-to-email conversion; and new public tables are no longer auto-exposed to the Data API, so migrations need deliberate grants as well as RLS.

## Review Focus

- **Direct or scripted callers:** invalid JWTs, anonymous-session creation without Turnstile, exceeded allowances, and oversized images must be rejected before Gemini. Covered in Tasks 2, 4, 7, and 8.
- **Duplicate and ambiguous requests:** concurrent duplicate keys produce one provider call; an unknown timeout counts globally but not personally and becomes manually retryable after two minutes. Covered in Tasks 2 and 4.
- **Account conversion:** an existing email signs into the existing owner without reassigning anonymous database rows, while the browser-local photo survives the active conversion flow. Covered in Task 8.
- **Conflicting lawn problems:** a different diagnosis becomes an observation unless the user explicitly switches, which atomically pauses the current plan. Covered in Tasks 9 and 10.
- **Legacy and partial data:** old diagnosis JSON, activities, and task completions remain visible; missing images or incomplete old records render a safe fallback instead of crashing. Covered in Tasks 5 and 14.

---

## File and Responsibility Map

### Shared contracts

- Create `shared/diagnosis-contract.ts` — versioned diagnosis, plan-seed, image-quality, and usage-summary types plus dependency-free runtime guards used by browser and Edge code.

### Edge and cost safety

- Create with CLI `supabase/config.toml` — committed local-stack configuration generated by `supabase init`; secrets remain environment references.
- Create `supabase/functions/_shared/ai-types.ts` — request-ledger, allowance, model-route, and provider-usage interfaces.
- Create `supabase/functions/_shared/gemini-client.ts` — bounded Gemini calls, structured output, usage extraction, and provider error normalization.
- Create `supabase/functions/diagnose-lawn/handler.ts` — dependency-injected HTTP handler for auth, validation, reservation, provider invocation, and finalization.
- Modify `supabase/functions/diagnose-lawn/index.ts` — thin runtime composition only.
- Create generated migration `supabase/migrations/<timestamp>_ai_cost_controls.sql` — private counters/runtime state/RPCs and owner-readable usage/entitlement records.
- Create `supabase/tests/database/ai_cost_controls.sql` — concurrency, allowance, idempotency, and RLS verification.
- Create `docs/operations/ai-cost-controls.md` — spend-cap, environment, monitoring, kill-switch, and release checklist.

### Browser diagnosis and guest conversion

- Create `src/features/diagnosis/api.ts` — typed diagnosis calls and stable request IDs.
- Create `src/features/diagnosis/legacyAdapter.ts` — old scan JSON to safe display model.
- Create `src/features/diagnosis/DiagnosisResult.tsx` — transparent evidence/confidence result UI.
- Create `src/features/guest/guestDraft.ts` — IndexedDB persistence for the browser-local image and preview context.
- Create `src/features/guest/GuestScanPage.tsx` — public photo, symptom, Turnstile, and preview flow.
- Create `src/features/guest/ConvertAccountPage.tsx` — anonymous identity linking or existing-account sign-in.
- Modify `src/contexts/AuthContext.tsx` — permanent vs anonymous session state and conversion operations.
- Modify `src/pages/OnboardingPage.tsx` — minimal profile completion followed by personalized re-analysis.

### Primary coaching

- Create generated migration `supabase/migrations/<timestamp>_primary_lawn_plans.sql` — cases, steps, scan links, ownership policies, and one-primary-plan invariant.
- Create `src/features/plans/types.ts` — case, plan-step, check-outcome, and reminder types.
- Create `src/features/plans/state.ts` — pure step selection, branching, completion, postponement, switching, and reminder derivation.
- Create `src/features/plans/api.ts` — complete-row React Query operations for cases and steps.
- Create `src/components/AppShell.tsx` — authenticated header/avatar and four-tab shell.
- Modify `src/components/BottomNav.tsx` — Today, Plan, Scan, Progress.
- Replace dashboard route with `src/pages/TodayPage.tsx`.
- Create `src/pages/PlanPage.tsx` and `src/pages/ProgressPage.tsx`.
- Refactor `src/pages/ScanPage.tsx` — allowance, initial/follow-up purpose, and case linkage.
- Modify `src/App.tsx` — guest, conversion, auth callback, and new authenticated routes.

### Follow-up and compatibility

- Create `src/features/progress/compare.ts` — comparison-state presentation and confirmation rules.
- Create `src/features/progress/api.ts` — before/after scan and timeline queries.
- Modify `src/pages/ActivityLogPage.tsx` and `src/pages/SchedulePage.tsx` only as needed to expose their content inside Progress and Plan while preserving legacy routes as redirects.
- Modify `src/types/database.ts` — additive typed records for every new table/column.

---

# Phase 0 — Cost Safety Before New Traffic

### Task 1: Add the versioned diagnosis and AI usage contracts

**Files:**
- Create: `shared/diagnosis-contract.ts`
- Create: `shared/diagnosis-contract.test.ts`
- Create: `supabase/functions/_shared/ai-types.ts`
- Modify: `tsconfig.app.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: `GuestDiagnosisPreview`, `DiagnosisV2`, `DiagnosisConfidence`, `DiagnosisEvidence`, `PlanSeed`, `PlanSeedStep`, `ImageQuality`, `AiUsageSummary`, `isGuestDiagnosisPreview(value: unknown): value is GuestDiagnosisPreview`, `isDiagnosisV2(value: unknown): value is DiagnosisV2`, and `isUsableDiagnosis(value: unknown): boolean`.
- `GuestDiagnosisPreview.schema_version` is exactly `"guest-preview-1"` and contains only `image_quality`, `likely_cause`, `confidence`, `summary`, and `safe_next_step`; it contains no alternatives, treatment fields, or `plan_seed`.
- `DiagnosisV2.schema_version` is exactly `2` and contains `image_quality`, `likely_cause`, `confidence`, `summary`, `evidence`, `alternatives`, `safe_next_step`, `safety_notes`, optional product-neutral treatment fields, and `plan_seed`.
- `AiUsageSummary` contains `model`, `input_tokens`, `output_tokens`, `thought_tokens`, and `total_tokens` as non-negative integers.

- [ ] **Step 1: Write failing contract tests**

Create tests named `accepts_guest_preview_contract`, `rejects_guest_preview_with_plan_seed`, `accepts_complete_v2_diagnosis`, `rejects_numeric_score_or_product_brand_shape`, `rejects_missing_image_quality`, and `rejects_negative_usage_tokens`. Assert exact acceptance and rejection behavior with representative JSON.

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `npx vitest run shared/diagnosis-contract.test.ts`

Expected: FAIL because `shared/diagnosis-contract.ts` does not exist.

- [ ] **Step 3: Implement the dependency-free contract and runtime guards**

Add the exact exported types and guards above. Do not import browser-only or Deno-only packages. Add a `@shared/*` alias in `tsconfig.app.json` and `vite.config.ts` so browser code can consume the same contract.

- [ ] **Step 4: Run the contract tests and type-check**

Run: `npx vitest run shared/diagnosis-contract.test.ts; npx tsc -p tsconfig.app.json --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add shared/diagnosis-contract.ts shared/diagnosis-contract.test.ts supabase/functions/_shared/ai-types.ts tsconfig.app.json vite.config.ts
git commit -m "feat: add versioned diagnosis contracts"
```

### Task 2: Add atomic scan allowance and global-cost state

**Files:**
- Create with CLI: `supabase/config.toml` if absent
- Create with CLI: `supabase/migrations/<timestamp>_ai_cost_controls.sql`
- Create: `supabase/tests/database/ai_cost_controls.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces owner-readable `scan_entitlements` and `ai_usage_events` records.
- Produces non-exposed private `ai_daily_counters`, `ai_network_attempts`, and `ai_runtime_state` records.
- Produces server-only RPCs:
  - `public.reserve_ai_request(p_user_id uuid, p_is_anonymous boolean, p_network_hash text, p_request_key uuid, p_route text, p_global_limit integer, p_guest_limit integer, p_network_limit integer) returns jsonb`
  - `public.mark_ai_request_started(p_event_id uuid) returns jsonb`
  - `public.finalize_ai_request(p_event_id uuid, p_scan_id uuid, p_usage jsonb) returns void`
  - `public.fail_ai_request(p_event_id uuid, p_status text, p_error_code text) returns void`
  - `public.switch_primary_case(...)` is not part of this migration; it belongs to Task 9.
- The service-only RPCs are `SECURITY INVOKER` public Data API entry points, with `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `service_role`; private tables/schemas are not exposed. Migrations explicitly grant only the browser operations needed on owner-readable public data because new public tables are not auto-exposed. Permanent users may select only their own safe allowance summary and usage rows; anonymous users may select only their own guest summary. Every policy distinguishes anonymous from permanent users with the trusted `is_anonymous` claim, not the shared `authenticated` role alone.

- [ ] **Step 1: Discover the installed Supabase CLI and initialize local configuration**

Run: `npx supabase --version; npx supabase --help; npx supabase init`

Expected: the CLI prints its version/help and creates `supabase/config.toml` without replacing the existing migrations. If the CLI is missing, install and pin it as a dev dependency and commit the lockfile before continuing.

- [ ] **Step 2: Discover the migration command and create the migration**

Run: `npx supabase migration --help; npx supabase migration new ai_cost_controls`

Expected: one timestamped migration is created. Use that generated path for every later step in this task.

- [ ] **Step 3: Write failing pgTAP tests**

Cover: one guest completion per anonymous user, a fourth guest provider attempt for the same network hash in a rolling 24 hours being blocked, three welcome completions in 30 days, no early monthly replenishment, monthly availability after day 30, one in-flight request, same-key idempotency, 101st total request blocked, 51st guest request blocked, failure not consuming personal allowance, failed/unusable guest provider attempts still counting toward the network and global safety limits, unknown outcome counting globally, cross-user SELECT denial, private-schema non-exposure, and browser-role EXECUTE denial on service-only RPCs.

- [ ] **Step 4: Run database tests and verify failure**

Run: `npx supabase start; npx supabase db reset; npx supabase test db`

Expected: FAIL because tables and RPCs do not exist.

- [ ] **Step 5: Implement the migration**

Use additive tables, indexes on `(user_id, created_at desc)` and private `(network_hash, created_at desc)` attempts, unique `(user_id, request_key)`, and a partial unique index preventing more than one `reserved` or `started` event per user. Store only an HMAC-SHA-256 network hash, never a raw address; keep it only in `ai_network_attempts` and purge it after its abuse-prevention retention window. Keep counter/runtime/network tables in a non-exposed private schema. Make service-only public RPCs `SECURITY INVOKER`, set an explicit safe `search_path`, revoke browser execution, grant only `service_role`, and make the reservation/counter update one transaction. Add explicit table/function grants and test them; RLS alone does not expose a table or authorize a function through the Data API.

- [ ] **Step 6: Add generated TypeScript record interfaces**

Add `ScanEntitlement`, `AiUsageEvent`, `AiUsageStatus`, and `AllowanceSummary` to `src/types/database.ts`; do not expose private counter tables to browser types.

- [ ] **Step 7: Run database tests and advisors**

Run: `npx supabase db reset; npx supabase test db; npx supabase db advisors`

Expected: all tests PASS and no unresolved security advisor findings for the new objects.

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml supabase/migrations supabase/tests/database/ai_cost_controls.sql src/types/database.ts package.json package-lock.json
git commit -m "feat: enforce atomic scan allowances"
```

### Task 3: Wrap Gemini with bounded models, output, and usage metering

**Files:**
- Create: `supabase/functions/_shared/gemini-client.ts`
- Create: `supabase/functions/_shared/gemini-client.test.ts`

**Interfaces:**
- Consumes: `GuestDiagnosisPreview`, `isGuestDiagnosisPreview`, `DiagnosisV2`, `isDiagnosisV2`, and AI types from Task 1.
- Produces:
  - `GeminiRoute = "guest_preview" | "personalized" | "follow_up"`
  - `GeminiDiagnosisRequest { route, imageBase64, mimeType, context }`
  - `GeminiDiagnosisResult = { route: "guest_preview", diagnosis: GuestDiagnosisPreview, usage: AiUsageSummary } | { route: "personalized" | "follow_up", diagnosis: DiagnosisV2, usage: AiUsageSummary }`
  - `GeminiDiagnosisClient.analyze(request): Promise<GeminiDiagnosisResult>`
  - `createGeminiDiagnosisClient(config, transport): GeminiDiagnosisClient`
- Guest configuration uses Flash-Lite, `thinkingBudget: 0`, and `maxOutputTokens: 700`; other routes use Flash, `thinkingBudget: 0`, and `maxOutputTokens: 1500`.

- [ ] **Step 1: Write failing provider-wrapper tests**

Test `guest_uses_lite_and_700_tokens`, `personalized_uses_flash_and_1500_tokens`, `thinking_is_zero`, `invalid_json_is_provider_failure`, `invalid_guest_contract_is_provider_failure`, `invalid_v2_contract_is_provider_failure`, `guest_response_cannot_include_plan_seed`, and `extracts_input_output_and_thought_usage` with a fake transport.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run supabase/functions/_shared/gemini-client.test.ts`

Expected: FAIL because the wrapper does not exist.

- [ ] **Step 3: Implement the client and strict prompts**

Use a transport interface so tests never call Gemini. Guest prompts require the limited `GuestDiagnosisPreview` contract and never generate or return hidden plan data. Personalized and follow-up prompts require `DiagnosisV2`. Remove numeric scoring and branded product instructions.

- [ ] **Step 4: Run tests**

Run: `npx vitest run supabase/functions/_shared/gemini-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/gemini-client.ts supabase/functions/_shared/gemini-client.test.ts
git commit -m "feat: bound Gemini diagnosis usage"
```

### Task 4: Harden the diagnosis Edge Function end to end

**Files:**
- Create: `supabase/functions/diagnose-lawn/handler.ts`
- Create: `supabase/functions/diagnose-lawn/handler.test.ts`
- Modify: `supabase/functions/diagnose-lawn/index.ts`

**Interfaces:**
- Consumes: Task 2 service-only RPCs and Task 3 `GeminiDiagnosisClient`.
- Produces:
  - `DiagnoseRequest { mode, request_id, image, mime_type, context }`
  - `DiagnoseResponse { diagnosis, allowance, usage_event_id }`
  - `createDiagnoseHandler(deps: DiagnoseHandlerDependencies): (request: Request) => Promise<Response>`
- `DiagnoseHandlerDependencies` injects `authenticate`, `getTrustedNetworkAddress`, `hashNetworkAddress`, `reserve`, `markStarted`, `finalize`, `fail`, `getRuntimeState`, `openCircuit`, `provider`, `clock`, and `allowedOrigins`.
- HTTP semantics: `400` invalid request/image, `401` invalid JWT, `403` invalid route for the authenticated session kind, `409` conflicting in-flight request, `429` personal/network/global allowance exhausted, `503` kill switch or open circuit.

- [ ] **Step 1: Write failing handler tests**

Cover: invalid JWT, API key without user JWT, anonymous session using a personalized route, permanent session using the guest route, disallowed origin, spoofed network address in the request body, missing trusted platform address on the guest route, HMAC network hashing, fourth network attempt, invalid MIME, decoded image over 3 MB, dimensions over 1,600, duplicate request ID, simultaneous second request, 101st global call, 51st guest call, kill switch, open circuit, success finalization, unusable image personal-allowance refund while retaining network/global counts, provider failure personal-allowance refund while retaining network/global counts, invalid provider JSON refund, and timeout becoming `unknown`.

- [ ] **Step 2: Add the duplicate-call and timeout regression assertions**

In `duplicate_request_id_returns_existing_result`, run two handler calls with the same UUID and assert the fake provider is invoked exactly once. In `unknown_timeout_allows_manual_retry_after_two_minutes`, assert no automatic retry, global count retained, personal allowance retained, and a new request accepted only after the injected clock advances two minutes.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run supabase/functions/diagnose-lawn/handler.test.ts`

Expected: FAIL because `createDiagnoseHandler` does not exist.

- [ ] **Step 4: Implement the dependency-injected handler**

Order checks exactly: method/origin → parse schema → verify JWT → derive anonymous/permanent state from trusted auth data → obtain the address from the documented platform-owned request field and HMAC it with a server-only secret → decode and validate image → check kill/circuit state → reserve atomically → mark started → call provider once → validate/finalize or fail. Reject Guest Preview if the platform-owned address is unavailable. Never accept a client-supplied user ID, anonymous flag, address/X-Forwarded-For chain, network hash, model, token limit, or allowance source.

- [ ] **Step 5: Replace the runtime file with thin composition**

`index.ts` should load server-only environment configuration, instantiate Supabase service/user clients and the bounded provider, call `serve(createDiagnoseHandler(deps))`, and contain no business rules. Configure allowed origins from `APP_ALLOWED_ORIGINS`; include production and explicit local-development origins only.

- [ ] **Step 6: Run handler, contract, and provider tests**

Run: `npx vitest run shared/diagnosis-contract.test.ts supabase/functions/_shared/gemini-client.test.ts supabase/functions/diagnose-lawn/handler.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/diagnose-lawn supabase/functions/_shared
git commit -m "feat: harden lawn diagnosis endpoint"
```

### Task 5: Add browser idempotency, safe errors, and the cost-control runbook

**Files:**
- Modify: `src/lib/gemini.ts`
- Modify: `src/pages/ScanPage.tsx`
- Modify: `src/pages/OnboardingPage.tsx`
- Create: `src/lib/gemini.test.ts`
- Create: `docs/operations/ai-cost-controls.md`
- Modify: `.env.example`

**Interfaces:**
- Produces `diagnoseLawn(request: BrowserDiagnosisRequest): Promise<DiagnoseResponse>` where `BrowserDiagnosisRequest` requires `mode`, `requestId`, `imageBase64`, `mimeType`, and typed context.
- Produces `DiagnosisApiError` with `code`, `status`, `retryable`, and user-safe `message`.
- Callers create one `crypto.randomUUID()` when a logical analysis starts and retain it through button rerenders and safe retries.

- [ ] **Step 1: Write failing browser API tests**

Test exact request payload/headers, retained request ID, `429` allowance copy, `503` temporary-unavailable copy, invalid server JSON, and no implicit fetch retry.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/lib/gemini.test.ts`

Expected: FAIL because the current positional API lacks the required request object and error type.

- [ ] **Step 3: Implement the typed API and update both existing callers**

Preserve current authenticated behavior while routing existing Scan and Onboarding calls through `mode: "personalized"`. Keep one request UUID per selected image. Display safe quota, circuit, and kill-switch messages without exposing provider details.

- [ ] **Step 4: Write the operations runbook**

Document: dedicated-project requirement; exact $10 Gemini project/service cap setup; 50/80/100% alerts; `AI_SCANS_ENABLED`; total/guest/network limits; model and output environment variables; the server-only network-HMAC secret and rotation/retention procedure without recording its value; Turnstile placeholders; Supabase manual identity linking; deliberate Data API grants; usage/circuit queries; emergency disable/re-enable; anonymous cleanup; and a release checkbox that blocks public Guest Preview until the cap is visually verified. State that provider caps can lag and application limits remain mandatory.

- [ ] **Step 5: Add safe environment examples**

Add names and non-secret defaults only. Never place real Supabase, Gemini, Turnstile, or service-role values in `.env.example`.

- [ ] **Step 6: Run Phase 0 verification**

Run: `npm test; npm run lint; npx tsc -p tsconfig.app.json --noEmit; npm run build; npx supabase test db`

Expected: all commands PASS. Existing logged-in scans still work within server limits; no anonymous route exists yet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gemini.ts src/lib/gemini.test.ts src/pages/ScanPage.tsx src/pages/OnboardingPage.tsx docs/operations/ai-cost-controls.md .env.example
git commit -m "feat: apply diagnosis cost controls in app"
```

**Phase 0 ship gate:** Deploy Phase 0 before enabling anonymous auth. Verify the $10 provider cap, make one production test scan, confirm one usage event with token counts, exercise `AI_SCANS_ENABLED=false`, then restore it. Do not proceed to public Guest Preview if any gate fails.

---

# Phase 1 — Guest Preview and Permanent-Account Conversion

### Task 6: Add safe legacy display and the transparent Diagnosis V2 UI

**Files:**
- Create: `src/features/diagnosis/legacyAdapter.ts`
- Create: `src/features/diagnosis/legacyAdapter.test.ts`
- Create: `src/features/diagnosis/DiagnosisResult.tsx`
- Create: `src/features/diagnosis/DiagnosisResult.test.tsx`
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes: shared `GuestDiagnosisPreview` and `DiagnosisV2` from Task 1.
- Produces `DisplayDiagnosis` with `likelyCause`, optional `confidence`, `summary`, `evidence`, `alternatives`, `safeNextStep`, `safetyNotes`, `isLegacy`, and `imageUsable`.
- Produces `toDisplayDiagnosis(value: unknown): DisplayDiagnosis` that never throws for legacy or partial JSON.
- Produces `<DiagnosisResult diagnosis mode="guest" | "personalized" | "history" />`.

- [ ] **Step 1: Write failing adapter tests**

Cover full V2, current `condition_score` JSON, null score, missing arrays, unknown JSON, and product suggestions. Assert legacy product brands are not promoted into new plan CTAs and unknown data renders a neutral fallback.

- [ ] **Step 2: Write failing component tests**

Assert Guest mode shows likely cause, confidence, short explanation, and safe next step only; personalized mode adds evidence, alternatives, safety notes, and plan CTA; no mode renders `/10` scoring or a branded purchase CTA.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/features/diagnosis/legacyAdapter.test.ts src/features/diagnosis/DiagnosisResult.test.tsx`

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement the adapter and component**

Use semantic headings, text labels in addition to confidence color, and safe fallback copy. Keep the component presentation-only.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/features/diagnosis/legacyAdapter.test.ts src/features/diagnosis/DiagnosisResult.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/diagnosis src/types/database.ts
git commit -m "feat: add transparent diagnosis presentation"
```

### Task 7: Persist the guest draft locally and model anonymous auth explicitly

**Files:**
- Create: `src/features/guest/guestDraft.ts`
- Create: `src/features/guest/guestDraft.test.ts`
- Modify: `src/contexts/AuthContext.tsx`
- Create: `src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Produces `GuestDraft { version: 1, image: Blob, previewUrlData?: string, symptom, previewDiagnosis, requestId, createdAt }`.
- Produces `saveGuestDraft`, `loadGuestDraft`, `clearGuestDraft`, and `isGuestDraftExpired`; expiry is 24 hours and clear removes the image Blob.
- Auth context adds `sessionKind: "none" | "anonymous" | "permanent"`, `ensureAnonymousSession(captchaToken): Promise<User>`, `linkAnonymousEmail(email): Promise<void>`, and `signIntoExistingAccount(email, password): Promise<void>`.

- [ ] **Step 1: Write failing IndexedDB tests**

Use a fake IndexedDB test environment or an injected minimal store. Assert Blob round-trip, 24-hour expiry, clear-on-success, and corrupted-record cleanup.

- [ ] **Step 2: Write failing AuthContext tests**

Assert anonymous and permanent sessions are distinguished from trusted session/user fields, Turnstile token is passed to `signInAnonymously`, email linking uses `updateUser`, and existing-account sign-in does not mutate or reassign guest-owned database rows.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/features/guest/guestDraft.test.ts src/contexts/AuthContext.test.tsx`

Expected: FAIL because guest draft and auth interfaces do not exist.

- [ ] **Step 4: Implement browser-local draft persistence**

Use IndexedDB directly or a tiny injected adapter; do not upload the guest image. Purge expired/corrupt records during load and after successful permanent scan persistence.

- [ ] **Step 5: Implement explicit session-kind and conversion operations**

Never authorize from user-editable metadata. Derive anonymous state from the Supabase user/JWT. Preserve the guest draft across anonymous sign-out and existing-account sign-in.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/features/guest/guestDraft.test.ts src/contexts/AuthContext.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/guest/guestDraft.ts src/features/guest/guestDraft.test.ts src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx
git commit -m "feat: preserve guest diagnosis through signup"
```

### Task 8: Build Guest Preview, Turnstile, and account conversion routes

**Files:**
- Create: `src/features/diagnosis/api.ts`
- Create: `src/features/diagnosis/api.test.ts`
- Create: `src/features/guest/GuestScanPage.tsx`
- Create: `src/features/guest/GuestScanPage.test.tsx`
- Create: `src/features/guest/ConvertAccountPage.tsx`
- Create: `src/features/guest/ConvertAccountPage.test.tsx`
- Create: `src/features/guest/AuthConversionCallbackPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: Task 5 browser diagnosis API, Task 6 diagnosis UI, and Task 7 guest/auth APIs.
- Produces public routes `/diagnose`, `/diagnose/convert`, and `/auth/convert`.
- Produces `GuestPreviewInput { imageBase64, mimeType, symptom, requestId }`, `GuestPreviewResult { diagnosis: GuestDiagnosisPreview, allowance: AllowanceSummary }`, `runGuestPreview(input: GuestPreviewInput): Promise<GuestPreviewResult>`, and `runPersonalizedDiagnosis(input: PersonalizedDiagnosisInput): Promise<DiagnoseResponse>` wrappers that pass exact route modes.
- Guest symptoms are `brown`, `weeds`, `bare`, `thin`, or `not_sure`.

- [ ] **Step 1: Write failing Guest Preview tests**

Assert the page accepts camera/gallery input, requires one symptom and Turnstile completion, creates an anonymous session once, preserves one request ID, shows image-quality retake without consuming personal allowance, shows only `GuestDiagnosisPreview`, and displays Create profile/Sign in CTAs. Assert network-limit and used-anonymous-allowance responses show safe copy and trigger no automatic retry.

- [ ] **Step 2: Write failing conversion tests**

Cover new email linking, email-already-exists sign-in path, preserved draft after auth callback, and no guest-row reassignment. Assert invalid/expired draft explains that the preview was not saved and never fabricates a personalized result.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/features/diagnosis/api.test.ts src/features/guest/GuestScanPage.test.tsx src/features/guest/ConvertAccountPage.test.tsx`

Expected: FAIL because pages and routes do not exist.

- [ ] **Step 4: Implement the guest entry route**

Hide authenticated navigation, explain photo guidance, render Turnstile once before anonymous session creation, save the browser-local draft before navigation, and transmit the image only to the bounded diagnosis endpoint. Do not persist the guest image in Supabase Storage or any cloud record before permanent-account conversion.

- [ ] **Step 5: Implement account conversion and callback**

New users link the email identity to the anonymous user and complete verification before setting a password; this flow remains disabled until Supabase manual identity linking is enabled and verified. Existing users sign into their existing account while the IndexedDB draft remains browser-local. After permanent auth, route to the minimal onboarding/profile context needed by Task 9.

- [ ] **Step 6: Preserve the existing direct login flow**

Existing `/login` behavior remains available. Add a clear route from login back to Guest Preview without creating navigation loops.

- [ ] **Step 7: Run tests, lint, and type-check**

Run: `npx vitest run src/features/diagnosis/api.test.ts src/features/guest/GuestScanPage.test.tsx src/features/guest/ConvertAccountPage.test.tsx; npm run lint; npx tsc -p tsconfig.app.json --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/diagnosis/api.ts src/features/diagnosis/api.test.ts src/features/guest src/App.tsx src/pages/LoginPage.tsx
git commit -m "feat: add protected guest lawn preview"
```

**Phase 1 partial ship gate:** The route may deploy behind `VITE_GUEST_PREVIEW_ENABLED=false`. Enable it only after Phase 0 production checks, Turnstile production keys, Supabase anonymous sign-ins with CAPTCHA enforcement, and the dedicated Gemini cap are verified.

---

# Phase 2 — One Primary Rescue Plan and Coach-First Navigation

### Task 9: Add cases, branched plan steps, and the one-primary-plan invariant

**Files:**
- Create with CLI: `supabase/migrations/<timestamp>_primary_lawn_plans.sql`
- Create: `supabase/tests/database/primary_lawn_plans.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces `lawn_cases` with statuses `observation`, `active`, `monitoring`, `paused`, `resolved`, `archived`.
- Produces `plan_steps` with kinds `action` and `check`, statuses `locked`, `ready`, `done`, `postponed`, `skipped`, ordered branch metadata, timing, weather constraints, and optional result.
- Extends `lawn_scans` with `case_id`, `purpose`, `diagnosis_schema_version`, `comparison_status`, and `comparison_summary`.
- Produces server-owned RPCs:
  - `public.start_plan_from_observation(p_case_id uuid) returns uuid`
  - `public.complete_plan_step(p_step_id uuid, p_result text) returns jsonb`
  - `public.postpone_plan_step(p_step_id uuid, p_due_at timestamptz) returns void`
  - `public.switch_primary_case(p_case_id uuid) returns void`
- Every public RPC derives the owner from `auth.uid()`, checks ownership, and rejects trusted JWTs whose `is_anonymous` claim is true. At most one primary active/monitoring case exists per permanent user.

- [ ] **Step 1: Create the migration with the CLI**

Run: `npx supabase migration new primary_lawn_plans`

Expected: one timestamped migration file. Use that exact generated path.

- [ ] **Step 2: Write failing pgTAP tests**

Cover explicit Data API grants, owner-only CRUD, anonymous-user write denial even though anonymous sessions use the `authenticated` role, starting from an observation, action completion, each check branch, invalid check outcome, postponement, one-primary uniqueness, explicit switching pausing the old case in one transaction, resuming a paused case, and cross-user RPC denial.

- [ ] **Step 3: Add the conflicting-problem regression test**

Create one active case and a second observation. Assert the second remains an observation until `switch_primary_case` is called; after the call, the first is `paused`, its unfinished steps remain unchanged, and the second alone is primary/active.

- [ ] **Step 4: Run database tests and verify failure**

Run: `npx supabase db reset; npx supabase test db`

Expected: FAIL because cases, steps, columns, and RPCs do not exist.

- [ ] **Step 5: Implement additive schema, policies, indexes, and RPCs**

Use `(select auth.uid())` ownership predicates, restrictive permanent-user checks based on the trusted `is_anonymous` JWT claim, explicit `USING` and `WITH CHECK` for updates, deliberate Data API grants, indexes for primary case and ordered steps, and an atomic switch transaction. Keep current scan rows valid with nullable new columns.

- [ ] **Step 6: Add browser record types**

Add `LawnCase`, `LawnCaseStatus`, `PlanStep`, `PlanStepKind`, `PlanStepStatus`, `ScanPurpose`, and additive scan fields to `src/types/database.ts`.

- [ ] **Step 7: Run database tests and advisors**

Run: `npx supabase db reset; npx supabase test db; npx supabase db advisors`

Expected: PASS with no unresolved security finding for new objects.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests/database/primary_lawn_plans.sql src/types/database.ts
git commit -m "feat: add primary lawn rescue plans"
```

### Task 10: Implement plan selection, branching, reminders, and complete-row queries

**Files:**
- Create: `src/features/plans/types.ts`
- Create: `src/features/plans/state.ts`
- Create: `src/features/plans/state.test.ts`
- Create: `src/features/plans/api.ts`
- Create: `src/features/plans/api.test.ts`

**Interfaces:**
- Produces `getPrimaryCase(cases): LawnCase | null`.
- Produces `getCurrentStep(steps, now): PlanStep | null` and `getNextPreview(steps, current): PlanStep | null`.
- Produces `deriveInAppReminder(step, weather, now): PlanReminder | null`.
- Produces `applyCheckOutcome(steps, stepId, outcome): PlanStep[]` for local optimistic-state testing; persisted transitions use Task 9 RPCs.
- React Query keys are `['lawn-cases', userId]`, `['plan-steps', userId, caseId]`, and `['primary-plan', userId]`. Every query selects complete rows required by every consumer.

- [ ] **Step 1: Write failing state-machine tests**

Cover ready-step selection, exactly one current action, locked future steps, action completion, dry/moist/not-sure check branches, postponed step returning when due, unsuitable weather suppressing an action, later suitable weather reminder, resolved/paused cases producing no current action, and no active plan producing maintenance mode.

- [ ] **Step 2: Write failing query-contract tests**

Mock Supabase and assert complete-row selections, ownership filters where applicable, stable keys, RPC use for transitions, and invalidation of all dependent complete-resource keys.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/features/plans/state.test.ts src/features/plans/api.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement pure state functions**

Keep timing and weather decisions pure and deterministic via explicit `now` and weather arguments. Do not embed React Query or Supabase calls in `state.ts`.

- [ ] **Step 5: Implement complete-row query and mutation hooks**

Keep the existing Activity Log cache regression in mind: never share a query key between partial and complete row shapes.

- [ ] **Step 6: Run tests and type-check**

Run: `npx vitest run src/features/plans/state.test.ts src/features/plans/api.test.ts; npx tsc -p tsconfig.app.json --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/plans
git commit -m "feat: add lawn plan state engine"
```

### Task 11: Convert the retained guest photo into a personalized observation and plan

**Files:**
- Modify: `src/pages/OnboardingPage.tsx`
- Create: `src/pages/OnboardingPage.test.tsx`
- Create: `src/features/plans/createPlan.ts`
- Create: `src/features/plans/createPlan.test.ts`
- Modify: `src/features/guest/ConvertAccountPage.tsx`

**Interfaces:**
- Consumes: Tasks 7–10.
- Produces `createObservationFromDiagnosis(userId, diagnosis, imageBlob, profileContext): Promise<{ caseId, scanId }>`.
- Produces `startPrimaryPlan(caseId): Promise<{ caseId, stepIds }>` using validated `plan_seed` and Task 9 RPCs.
- Personalized re-analysis uses the retained request context but a new idempotency key and consumes the first welcome scan.

- [ ] **Step 1: Write failing conversion-to-plan tests**

Assert minimal profile collection, one personalized re-analysis, private image upload only after permanent auth, saved V2 scan, observation creation, Start plan creating one primary case, Decline retaining an observation, and guest draft deletion only after scan persistence succeeds.

- [ ] **Step 2: Add existing-account and allowance regressions**

Assert an existing-account sign-in uses that account's allowance and creates only that account's rows. Assert exhausted allowance preserves the local draft and explains the reset date without uploading the image.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/pages/OnboardingPage.test.tsx src/features/plans/createPlan.test.ts`

Expected: FAIL because the conversion pipeline does not exist.

- [ ] **Step 4: Implement observation persistence and plan creation**

Use private storage under the permanent user ID. Validate the diagnosis contract again before persistence. Translate only validated product-neutral `plan_seed` data into server-owned step defaults.

- [ ] **Step 5: Refactor onboarding around missing context**

Existing authenticated users without a guest draft keep the current grass/location onboarding path and land in maintenance mode. Converted guests are asked only for missing personalization context and then continue to the retained photo result.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/pages/OnboardingPage.test.tsx src/features/plans/createPlan.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/OnboardingPage.tsx src/pages/OnboardingPage.test.tsx src/features/plans/createPlan.ts src/features/plans/createPlan.test.ts src/features/guest/ConvertAccountPage.tsx
git commit -m "feat: turn diagnoses into rescue plans"
```

### Task 12: Replace utility navigation with the Coach-first app shell and Today screen

**Files:**
- Create: `src/components/AppShell.tsx`
- Create: `src/components/AppShell.test.tsx`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/TodayPage.tsx`
- Create: `src/pages/TodayPage.test.tsx`
- Retire after parity: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: Task 10 primary-plan and reminder hooks.
- Produces authenticated routes `/`, `/plan`, `/scan`, `/progress`, and `/profile` through `AppShell`.
- `TodayPage` renders exactly one of: `active_action`, `waiting_or_monitoring`, `maintenance_action`, `risk_inspection_prompt`, or `nothing_due`.
- Profile is opened from the header avatar; bottom navigation is exactly Today, Plan, Scan, Progress.

- [ ] **Step 1: Write failing shell/navigation tests**

Assert four tabs and destinations, active state, profile avatar route, safe-area behavior class/style, guest routes without the shell, and legacy `/log` and `/schedule` not appearing in top-level navigation.

- [ ] **Step 2: Write failing Today state tests**

Cover: one current action with effort/reason/weather/Show me how/I did this/Remind me later; postponed action; monitoring with follow-up date; seasonal maintenance action; risk prompt that asks for user confirmation; and `Nothing needs attention right now`. Assert no full checklist renders on Today.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/components/AppShell.test.tsx src/pages/TodayPage.test.tsx`

Expected: FAIL because the shell and Today page do not exist.

- [ ] **Step 4: Implement the shell and routes**

Keep profile/account controls available from the header. Preserve protected-route behavior for permanent users and prevent anonymous users from entering authenticated coaching routes.

- [ ] **Step 5: Implement Today with existing weather integration**

Reuse `fetchWeather` and current weather advice only where it explains action suitability. Do not let weather create a problem automatically.

- [ ] **Step 6: Run tests and mobile smoke build**

Run: `npx vitest run src/components/AppShell.test.tsx src/pages/TodayPage.test.tsx; npm run build`

Expected: PASS. Inspect the built app at a mobile viewport and confirm the primary CTA is visible without horizontal scrolling.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppShell.tsx src/components/AppShell.test.tsx src/components/BottomNav.tsx src/App.tsx src/pages/TodayPage.tsx src/pages/TodayPage.test.tsx
git commit -m "feat: add coach-first Today experience"
```

### Task 13: Build the progressive Plan and allowance-aware Scan experiences

**Files:**
- Create: `src/pages/PlanPage.tsx`
- Create: `src/pages/PlanPage.test.tsx`
- Refactor: `src/pages/ScanPage.tsx`
- Create or expand: `src/pages/ScanPage.test.tsx`
- Modify: `src/pages/SchedulePage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Tasks 5, 9, 10, and 11.
- Plan shows current step fully, next step preview, and later locked steps. Seasonal guidance appears below the primary rescue plan.
- Scan shows remaining allowance before capture, next reset, initial/follow-up intent, current-case linkage, recent scans, and preserved access when allowance is exhausted.

- [ ] **Step 1: Write failing Plan tests**

Assert progressive disclosure, action completion, check-outcome options, postponement, next-step unlock, paused plan preservation, explicit switch confirmation, seasonal guidance in a secondary section, and no competing active checklist.

- [ ] **Step 2: Write failing Scan tests**

Cover welcome allowance, post-day-30 allowance, exhausted state, failed/unusable refund messaging, initial scan becoming observation, follow-up requiring current case, one-in-flight disabled state, duplicate request ID reuse, private signed images, and legacy scan fallback.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/pages/PlanPage.test.tsx src/pages/ScanPage.test.tsx`

Expected: FAIL because Plan does not exist and Scan lacks the new behavior.

- [ ] **Step 4: Implement Plan progressive disclosure**

Use Task 10 pure selectors and Task 9 RPCs. Confirmation is required before switching primary cases; no model result or scan silently switches it.

- [ ] **Step 5: Refactor Scan into focused components without changing storage privacy**

Split capture, allowance, current result, and history presentation into local focused components if `ScanPage.tsx` would otherwise continue growing. Keep complete `lawn_scans` rows under one query contract.

- [ ] **Step 6: Redirect legacy Schedule route**

Keep `/schedule` as a compatibility redirect to `/plan#seasonal`; do not delete seasonal logic or completion history.

- [ ] **Step 7: Run tests, lint, and type-check**

Run: `npx vitest run src/pages/PlanPage.test.tsx src/pages/ScanPage.test.tsx; npm run lint; npx tsc -p tsconfig.app.json --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/PlanPage.tsx src/pages/PlanPage.test.tsx src/pages/ScanPage.tsx src/pages/ScanPage.test.tsx src/pages/SchedulePage.tsx src/App.tsx
git commit -m "feat: guide progressive lawn rescue plans"
```

**Phase 2 ship gate:** A converted user can create one primary plan, see one action on Today, complete or postpone it, choose a check outcome, and see the next step without using legacy utility pages.

---

# Phase 3 — Follow-Up, Evidence-Based Progress, and Compatibility

### Task 14: Add follow-up comparison and user-confirmed outcome transitions

**Files:**
- Create: `src/features/progress/compare.ts`
- Create: `src/features/progress/compare.test.ts`
- Create: `src/features/progress/api.ts`
- Create: `src/features/progress/api.test.ts`
- Modify: `src/pages/ScanPage.tsx`
- Modify: `supabase/functions/diagnose-lawn/handler.ts`
- Modify: `supabase/functions/diagnose-lawn/handler.test.ts`

**Interfaces:**
- Produces `ComparisonStatus = "improving" | "unchanged" | "worsening" | "resolved" | "unable_to_determine"`.
- Produces `ComparisonProposal { status, summary, evidence }` and `confirmComparison(caseId, scanId, status): Promise<void>`.
- Follow-up provider mode accepts only the minimum original/follow-up image context and uses the 1,500-token bounded configuration.
- Model output proposes status; only explicit user confirmation updates case status or archives/replaces a plan.

- [ ] **Step 1: Write failing pure comparison tests**

Assert every status maps to plain-language display, `unable_to_determine` requests a clearer photo, and no proposal mutates a case before confirmation.

- [ ] **Step 2: Write failing API and handler tests**

Cover owner-only confirmation, follow-up linkage, two-image size validation, allowance consumption, provider failure refund, model-proposed resolved remaining uncommitted, user correction, and confirmation transitioning to monitoring/resolved/worsening as selected.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/features/progress/compare.test.ts src/features/progress/api.test.ts supabase/functions/diagnose-lawn/handler.test.ts`

Expected: FAIL because comparison behavior does not exist.

- [ ] **Step 4: Implement bounded follow-up analysis**

Reuse the Phase 0 ledger, idempotency, kill switch, caps, and provider wrapper. Do not send the full scan history or plan history to Gemini.

- [ ] **Step 5: Implement explicit confirmation and correction**

Keep the proposal visible until the user confirms one status. Persist both the model proposal and user-confirmed outcome for auditability.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/features/progress/compare.test.ts src/features/progress/api.test.ts supabase/functions/diagnose-lawn/handler.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/progress src/pages/ScanPage.tsx supabase/functions/diagnose-lawn
git commit -m "feat: add user-confirmed lawn follow-ups"
```

### Task 15: Build Progress, fold in Activity History, and preserve legacy data

**Files:**
- Create: `src/pages/ProgressPage.tsx`
- Create: `src/pages/ProgressPage.test.tsx`
- Modify: `src/pages/ActivityLogPage.tsx`
- Modify: `src/pages/ActivityLogPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: Task 6 legacy adapter, Task 10 completed steps, and Task 14 comparisons.
- Progress presents before/after photos, confirmed observable status, change summary, completed-plan-step timeline, existing manual activities, legacy scans, resolved plans, and next monitoring decision.
- `/log` redirects to `/progress#activity`; manual activity creation remains accessible within Progress.

- [ ] **Step 1: Write failing Progress tests**

Cover before/after labels and dates, improving/unchanged/worsening/resolved/unable states, completed steps without duplicate manual activity rows, `Nothing needs attention` success, missing signed image, legacy JSON, partial legacy record, resolved archive, and current next-monitoring decision.

- [ ] **Step 2: Extend the existing Activity Log cache regression**

Navigate from Today/Plan to Progress and assert activity IDs, notes, and deletion controls remain present. Assert all consumers use the same complete-row `['activities', userId]` contract.

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/pages/ProgressPage.test.tsx src/pages/ActivityLogPage.test.tsx`

Expected: FAIL because Progress does not exist.

- [ ] **Step 4: Implement Progress and embed manual history**

Use text plus icons for status, never `/10` scoring. Treat no-treatment-needed as a successful state. Reuse Activity Log form/history behavior rather than maintaining two copies.

- [ ] **Step 5: Add compatibility redirects and profile allowance summary**

Redirect `/log` to Progress and keep `/schedule` redirect from Task 13. Profile shows lawn/location/account/allowance/settings but no outbound notification settings or billing controls.

- [ ] **Step 6: Run tests, lint, type-check, and build**

Run: `npm test; npm run lint; npx tsc -p tsconfig.app.json --noEmit; npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ProgressPage.tsx src/pages/ProgressPage.test.tsx src/pages/ActivityLogPage.tsx src/pages/ActivityLogPage.test.tsx src/pages/ProfilePage.tsx src/App.tsx
git commit -m "feat: show evidence-based lawn progress"
```

### Task 16: Verify security, costs, complete journey, and deployment readiness

**Files:**
- Modify: `docs/operations/ai-cost-controls.md`
- Create: `docs/operations/problem-first-release-checklist.md`
- Modify as failures require: tests and implementation files owned by Tasks 1–15

**Interfaces:**
- Produces a signed-off release checklist with provider cap evidence, environment values by name, database advisor results, test commands, production smoke results, and rollback/kill-switch instructions.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test; npm run lint; npx tsc -p tsconfig.app.json --noEmit; npm run build; npx supabase db reset; npx supabase test db; npx supabase db advisors`

Expected: every command PASS and no unresolved security advisor finding.

- [ ] **Step 2: Run the auth and RLS matrix**

Verify unauthenticated, anonymous, permanent user A, permanent user B, and service-role behavior for profiles, scans, cases, steps, entitlements, usage events, Storage objects, and every RPC. Verify both Data API grants and RLS, including that an anonymous user cannot inherit permanent-user access merely through the shared `authenticated` role. Expected: only explicitly documented owner/server operations succeed.

- [ ] **Step 3: Run the cost-failure matrix**

Verify invalid JWT, anonymous-session creation without Turnstile, fourth network guest attempt, second anonymous preview, fourth welcome completion, pre-day-30 monthly attempt, 51st guest call, 101st total call, duplicate ID, concurrent request, provider timeout, circuit opening, kill switch, oversized image, and missing usage metadata. Expected: zero unaccounted provider calls and no incorrect personal allowance consumption.

- [ ] **Step 4: Verify the dedicated Gemini project manually**

Confirm the API key belongs only to the My Lawn project, the $10 spend cap or enforceable equivalent is active, 50/80/100% alerts target the owner, actual stable model IDs/prices match configuration, Supabase CAPTCHA and manual identity linking are enabled, and the free/paid data-use choice is understood. Record the verification date without recording secrets.

- [ ] **Step 5: Run mobile and desktop journey smoke tests**

Verify Guest Preview → new account conversion → minimal profile → personalized diagnosis → Start plan → Today action → check branch → postpone → follow-up → user-confirmed outcome → Progress → resolved maintenance mode. Repeat the conversion branch with an existing account.

- [ ] **Step 6: Verify Vercel route behavior in preview**

Open `/diagnose`, `/diagnose/convert`, `/auth/convert`, `/plan`, `/scan`, `/progress`, `/log`, and `/schedule` directly. Expected: SPA routes return the app, protected routes redirect correctly, and compatibility routes land on their new sections.

- [ ] **Step 7: Exercise the production-style emergency stop before enabling Guest Preview**

Set `AI_SCANS_ENABLED=false`, confirm a new scan returns the friendly `503` state with no provider event started, then restore `true` and run one controlled scan. Confirm its usage event contains model and token counts.

- [ ] **Step 8: Complete and commit the release checklist**

```bash
git add docs/operations/ai-cost-controls.md docs/operations/problem-first-release-checklist.md
git commit -m "docs: add problem-first release checks"
```

---

## Dependency and Release Order

1. Ship Phase 0 by itself and verify production cost controls before anonymous auth exists.
2. Deploy Phase 1 behind `VITE_GUEST_PREVIEW_ENABLED=false`; enable only after the provider cap, Turnstile, and production usage ledger are verified.
3. Ship Phase 2 after the one-primary-plan database tests and guest-to-plan journey pass.
4. Ship Phase 3 after follow-up confirmation, legacy compatibility, RLS, and complete cost-failure matrices pass.
5. Keep Stripe, paid tiers, and higher scan limits out of this plan. Raising provider or application caps requires a separate observed-usage decision.
