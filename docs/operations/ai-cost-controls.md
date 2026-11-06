# AI cost controls and release runbook

Public lawn scans stay disabled until every release checkbox below is complete. The Gemini key, Supabase service/secret key, network HMAC secret, and Turnstile secret are server-only. Never put them in Vercel variables prefixed with `VITE_`, browser code, logs, screenshots, or support messages.

## 1. Dedicated Gemini project and $10 monthly cap

Use a Google Cloud project dedicated to My Lawn Gemini inference. Do not share it with unrelated workloads or API keys.

1. In Google Cloud Billing, open **Budgets & alerts → Create budget**.
2. Scope it to exactly the dedicated My Lawn project and the **Gemini API** service.
3. Set the period to monthly, the amount to **$10 USD**, and enable **Spend cap** (not an alerts-only budget).
4. Confirm the cap uses gross estimated costs and that alerts will be sent at **50%, 80%, and 100%**. Spend-cap recipients cannot be customized: Google sends them to all billing account administrators and project owners. Confirm at least one of those roles belongs to a monitored operator address, or establish and test a monitored forwarding path.
5. In Google AI Studio, select the same project, open **Spend**, and visually confirm the project/monthly cap is $10 and active. Confirm **Usage** and **Rate limits** show only the intended project.
6. Create one API key in that project, restrict it to the Gemini API where the console permits, and store it only as the Supabase Edge secret `GEMINI_API_KEY`.

Google documents service-specific spend caps as enforcement controls, but enforcement is not instantaneous and overage can occur while estimated costs catch up. AI Studio notes approximately ten minutes of possible latency. Ordinary alerts-only Cloud Billing budgets do not stop spending. Therefore the application limits, kill switch, output caps, and circuit breaker below remain mandatory even with the $10 cap: [Gemini billing and project caps](https://ai.google.dev/gemini-api/docs/billing/), [Cloud spend-cap budgets](https://cloud.google.com/billing/docs/how-to/budgets-spend-caps), [alerts-only budget warning](https://cloud.google.com/billing/docs/how-to/budgets).

## 2. Required Edge secrets and safe defaults

Configure these as Supabase Edge Function secrets, not browser/Vercel public variables:

| Name | Initial value / rule |
| --- | --- |
| `AI_SCANS_ENABLED` | `false` until the production ship gate is complete |
| `AI_DAILY_GLOBAL_LIMIT` | `100` |
| `AI_DAILY_GUEST_LIMIT` | `50` |
| `AI_GUEST_NETWORK_LIMIT` | `3` attempts per network HMAC in 24 hours |
| `GEMINI_GUEST_MODEL` | `gemini-2.5-flash-lite`; re-verify support and price before release |
| `GEMINI_DIAGNOSIS_MODEL` | `gemini-2.5-flash`; re-verify support and price before release |
| `APP_ALLOWED_ORIGINS` | Exact production origin plus explicit local origins only |
| `NETWORK_HMAC_SECRET` | At least 32 cryptographically random bytes; never reuse another secret |
| `GEMINI_API_KEY` | Key from the dedicated capped project only |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Server-only project credential |

The code fixes Guest Preview output at 700 tokens, personalized/follow-up output at 1,500 tokens, and thinking at zero. Gemini rate limits are project-wide rather than key-wide, so additional keys do not create an independent safety boundary: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

### Model and price review — 2026-11-06

The checked-in defaults remain `gemini-2.5-flash-lite` for Guest Preview and `gemini-2.5-flash` for personalized/follow-up diagnosis. Official paid-tier standard pricing currently lists:

| Model | Input / 1M text, image, or video tokens | Output / 1M tokens | Maximum configured output cost per call |
| --- | ---: | ---: | ---: |
| `gemini-2.5-flash-lite` | $0.10 | $0.40 | $0.00028 at 700 tokens |
| `gemini-2.5-flash` | $0.30 | $2.50 | $0.00375 at 1,500 tokens |

Input/image tokens are additional, so these are output-only ceilings rather than total-call estimates. The application records actual input, output, thought, and total token counts for reconciliation. See [official Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

Google now states that access to the 2.5 models can be limited for new projects and recommends current stable models for new workloads. Do not silently replace the configured IDs: newer models have different pricing and thinking configuration, and lawn-diagnosis quality must be evaluated. Before enabling scans, confirm the dedicated project can call both configured IDs. If it cannot, keep `AI_SCANS_ENABLED=false`, select stable replacements from the [official model list](https://ai.google.dev/gemini-api/docs/models), update provider-contract tests/configuration, and run the controlled production scan gate again.

Paid-tier requests are listed as not used to improve Google's products; free-tier requests are listed as used to improve them. Confirm the dedicated project is on the intended billing/data-use tier before sending user lawn photos.

Set or change secrets with the project-scoped Supabase CLI, for example:

```powershell
npx supabase secrets set AI_SCANS_ENABLED=false --project-ref <project-ref>
```

Do not paste secret values into this runbook or commit them to `.env.example`.

## 3. Network HMAC rotation and retention

- The Edge Function hashes Supabase gateway `x-real-ip` with HMAC-SHA-256. Raw addresses are never stored.
- `private.ai_network_attempts` is limited to the rolling 24-hour protection window; stale rows are purged during guest reservation.
- Rotate `NETWORK_HMAC_SECRET` only during a maintenance window. Rotation intentionally changes every hash and temporarily resets network-history correlation, so keep `AI_SCANS_ENABLED=false` during rotation and for verification.
- Record only the rotation date and secret version in the operator log—not the value. Store the value in the approved secret manager.
- After 24 hours, the previous secret is no longer needed for rate-limit continuity and should be removed from the secret manager according to its retention policy.

## 4. Supabase/Auth/Turnstile release controls

- Keep anonymous sign-in disabled until the Guest Preview task is complete and verified.
- Before enabling it, configure Cloudflare Turnstile, set `VITE_TURNSTILE_SITE_KEY` in the browser environment and `TURNSTILE_SECRET_KEY` only on the server, and verify a proof is required before anonymous-session creation.
- Enable and test Supabase manual identity linking before account conversion. A guest must never transfer database rows to an unrelated existing account.
- Public tables use RLS. Browser roles may only read their own safe entitlement/usage rows. The reservation, start, finalize, failure, runtime, and circuit RPCs are deliberately executable by `service_role` only. Do not grant them to `anon` or `authenticated` to “fix” a client error.
- The `private` schema must remain absent from PostgREST’s exposed schemas.

## 5. Monitoring queries

Run these in the authenticated Supabase SQL editor. Do not expose private counters through a browser endpoint.

```sql
-- Today’s global and guest reservations.
select *
from private.ai_daily_counters
where counter_date = (now() at time zone 'UTC')::date;

-- Provider calls and missing/partial usage metadata in the last 24 hours.
select status, route, model, usage_metadata_complete,
       count(*) as calls, sum(coalesce(total_tokens, 0)) as tokens
from public.ai_usage_events
where created_at >= now() - interval '24 hours'
group by status, route, model, usage_metadata_complete
order by status, route;

-- Any event that needs reconciliation.
select id, user_id, request_key, status, error_code, created_at, updated_at
from public.ai_usage_events
where status in ('reserved', 'started', 'unknown')
order by updated_at;

-- Kill/circuit state.
select circuit_open_until, consecutive_failures, updated_at
from private.ai_runtime_state;
```

Investigate any `usage_metadata_complete = false`, unexpected model, rapid anonymous-user creation, repeated `unknown`, or sharp counter increase. Keep provider-side 50/80/100% alerts enabled even when application traffic appears normal.

## 6. Emergency disable and recovery

1. Set `AI_SCANS_ENABLED=false` in Supabase secrets immediately.
2. Confirm a controlled authenticated scan returns the friendly `503` state and that no new event reaches `started`.
3. Inspect AI Studio spend/usage, `ai_daily_counters`, `ai_usage_events`, and `ai_runtime_state`.
4. Revoke the Gemini key if exposure is suspected. Create a replacement only in the same dedicated capped project.
5. Fix and verify the cause locally. Re-enable with `AI_SCANS_ENABLED=true` only after the $10 cap is visibly active and one controlled production scan can be monitored end to end.

Never add an automatic browser retry for a diagnosis. An ambiguous provider outcome stays globally counted and permits a new manual request only after the two-minute cooldown.

## 7. Anonymous-account cleanup

Once anonymous auth is enabled, run a scheduled server-side cleanup using the Supabase Admin API. Delete abandoned anonymous users only after the product retention window and only when they have no active conversion or retained user-owned data. Deleting the Auth user must rely on the existing `on delete cascade` relationships; never reassign an anonymous user’s rows to an existing permanent account. Start with a dry-run report and operator approval before enabling deletion.

## Phase 0 production ship gate

- [ ] Dedicated Google Cloud project contains only My Lawn Gemini usage.
- [ ] Gemini API service-specific monthly spend cap is visibly **Configured at $10**.
- [ ] A monitored billing administrator or project owner receives/has verified 50%, 80%, and 100% alert routing.
- [ ] Stable model identifiers and current prices were rechecked in official Gemini documentation.
- [ ] All Edge secrets are set; no secret appears in Vercel public variables or source control.
- [ ] `AI_SCANS_ENABLED=false` returns the friendly unavailable state without starting a provider event.
- [ ] `AI_SCANS_ENABLED=true` allows exactly one controlled production scan.
- [ ] That scan records the expected model, token counts, and `usage_metadata_complete=true`.
- [ ] Global/guest/network limits and circuit state match the values in this runbook.
- [ ] Browser roles cannot execute service-only RPCs or read the `private` schema.
- [ ] Public Guest Preview remains disabled; anonymous Auth and Turnstile are not enabled in Phase 0.
- [ ] The dedicated project successfully called each configured stable model ID after the 2026 model-access change, or reviewed replacements were deployed and re-tested.
- [ ] The chosen billing tier's image/data-use behavior was reviewed and accepted.

If any checkbox fails, leave `AI_SCANS_ENABLED=false` and do not expose public Guest Preview.
