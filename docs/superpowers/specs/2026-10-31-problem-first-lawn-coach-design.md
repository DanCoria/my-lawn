# Problem-First Lawn Coach Design

**Date:** October 31, 2026  
**Status:** Draft for builder review and user approval  
**Selected approach:** End-to-end problem-first vertical slice

## Intent

My Lawn should help an uncertain homeowner understand a visible lawn problem, take one safe action at a time, and see whether the lawn improved. Maintenance tracking remains useful, but it supports the guidance experience instead of defining the product.

The core return loop is:

> Concern → diagnosis → rescue plan → guided action → follow-up → visible progress

The product should feel like a calm, transparent coach. It should not feel like a generic dashboard, a chore journal, a product-sales funnel, or an AI that overstates what it can infer from one photo.

## Goals

- Let a visitor experience one useful Guest Preview before creating an account.
- Convert the preview into a personalized diagnosis and one primary rescue plan.
- Show one recommended action at a time, with future steps progressively disclosed.
- Explain diagnostic uncertainty, visible evidence, alternatives, and the safest verification step.
- Automatically preserve completed plan steps as history without requiring duplicate manual logging.
- Use follow-up photos and observable changes to show progress.
- Preserve current seasonal guidance, scan history, and manual activity history in a simpler information architecture.
- Establish the free scan policy needed for the guest and personalized experience.

## Success criteria

A new visitor can:

1. Upload one problem photo without creating a named account.
2. Receive an at-a-glance likely cause, confidence, short explanation, and safe next step.
3. Create a permanent account and a minimal lawn profile without losing the selected photo or preview context during the uninterrupted flow.
4. Receive a transparent, personalized diagnosis and start one primary rescue plan.
5. Complete or postpone the current action from the Today experience.
6. Return later, add a follow-up photo, and see evidence-based progress.

A returning user can understand within a few seconds:

- what needs attention now;
- why it is appropriate now;
- what action comes next;
- whether the primary problem is improving.

## Non-goals for this milestone

- Stripe, paid subscriptions, or checkout.
- Multiple simultaneously active rescue plans.
- Multiple lawns per account.
- Email, SMS, or push notifications.
- Branded product recommendations or affiliate links.
- A marketplace, community, or expert-chat feature.
- A generalized workflow engine for arbitrary future plan types.
- Replacing every existing seasonal lawn-care rule with AI-generated content.

## Anti-goals

- Do not manufacture daily tasks or streaks to increase engagement.
- Do not expose a long checklist when only one step is relevant.
- Do not present an arbitrary lawn-health score as objective measurement.
- Do not silently create a new problem from weather data or a speculative model result.
- Do not recommend a treatment before a low-risk verification step when the diagnosis is uncertain.
- Do not make users log the same work in both Plan and Activity History.
- Do not make the guest result useless merely to force signup.

## Existing product and constraints

The existing Vite/React application already has Supabase email/password authentication, profiles, grass and location onboarding, weather advice, AI diagnosis through a Supabase Edge Function, private scan storage, scan history, seasonal schedules, task completions, and manual activity logging.

The current diagnosis contract uses a numeric condition score, issue severity, and branded product suggestions. The new experience replaces that contract for new scans while retaining a display adapter for legacy scan history.

Existing data migrations must remain additive. Current scan records, activities, task completions, and profiles must remain readable.

## Approaches considered

### A. End-to-end problem-first vertical slice — selected

Build the Guest Preview, account conversion, personalized diagnosis, one primary plan, Coach-first Today screen, progressive actions, follow-up scan, and evidence-based Progress as one coherent journey. Reuse and reorganize existing Schedule and Activity Log behavior.

This validates the full reason a user would return without building every future business feature.

### B. Visual redesign before backend behavior

Build the new screens using temporary data, then connect plans and follow-ups later. This would produce visible polish sooner but risks throwaway UI and an attractive experience without a working coaching loop.

### C. Full platform architecture first

Build multiple lawns, multiple active problems, subscriptions, outbound notifications, a generalized plan engine, and product commerce before the UX launch. This is more extensible but delays validation and conflicts with the simplicity goal.

## Product model

### One primary problem

A permanent account may have one primary rescue plan in `active` or `monitoring` status. Other scans may:

- update the current problem;
- be saved as an observation;
- be retained in history for later review.

They do not create competing active task lists in this milestone.

When a scan identifies a different issue, it is saved as an observation by default. The user may explicitly make it the primary problem; doing so pauses the current plan, preserves its unfinished steps and history, and activates the new plan in one transaction. A paused plan can be resumed later, but resuming it pauses the current primary plan. The app never switches the primary problem automatically.

### One current action

The coach selects one current action from the primary plan. The user sees:

- the action and estimated effort;
- why it matters;
- why the timing or weather is suitable;
- step-by-step instructions;
- **I did this** and **Remind me later** controls;
- a preview of the next step;
- later steps only when they become relevant.

### User-confirmed problems

The app may suggest an inspection because of season, weather, lack of improvement, or a follow-up image. Only a user-confirmed symptom or scan can create or replace the primary problem.

## Experience flows

### 1. Guest Preview

1. The public entry point asks what looks wrong and prompts for a clear photo.
2. The visitor may select a symptom such as brown area, weeds, bare area, thinning, or **not sure**.
3. The app silently creates a Supabase anonymous session and submits the photo through the protected diagnosis Edge Function.
4. The preview returns:
   - most likely cause;
   - low, medium, or high confidence;
   - a short plain-language explanation;
   - one safe next step.
5. The preview does not store the image in Supabase Storage. The browser retains it only for the uninterrupted conversion flow.
6. The primary call to action is **Create my lawn profile**. Existing users can sign in.

If the visitor leaves, clears browser data, or closes the conversion flow, the unsaved guest photo and result may be lost. The UI must say that creating a profile saves the result.

### 2. Account conversion and personalization

1. The anonymous user links an email identity to the existing Supabase user so the user ID and guest allowance history remain stable.
2. The app collects the minimum profile needed for personalization:
   - display name is optional;
   - grass type, with photo-assisted identification or manual selection;
   - location, with clear permission and manual entry alternatives.
3. The app re-analyzes or expands the retained guest photo using grass, location, date, local weather, symptom answers, and relevant recent activity. This personalized analysis consumes the first of the three welcome scans.
4. The personalized diagnosis is saved with the now-permanent user ID and the image is uploaded to the existing private scan bucket.
5. The app offers **Start this plan** and creates the primary rescue plan.

The builder must verify the current Supabase anonymous-to-permanent email-linking flow before implementation. Current Supabase documentation requires manual identity linking to be enabled and email verification before a password can be set.

If the entered email already belongs to a permanent account, the user signs into that account rather than transferring ownership from the anonymous user. The browser-local photo and preview context remain available during the active flow and may be submitted as a new personalized scan under the permanent account if that account has allowance. No database row is reassigned between users; the abandoned anonymous account is handled by the cleanup policy.

### 3. Personalized diagnosis

The diagnosis screen shows:

- likely cause;
- confidence level, not a numeric health score;
- explanation of what the model can see;
- evidence supporting the likely cause;
- meaningful alternatives;
- an image-quality or uncertainty warning when appropriate;
- the safest verification step;
- safety notes;
- a product-neutral treatment category or active ingredient only when treatment is warranted.

It must not show branded product suggestions. It must remind users to follow product labels and local restrictions when chemical treatment is involved.

### 4. Primary rescue plan

The plan is a small ordered sequence with three conceptual stages:

- **Do now** — the current safe action or verification step;
- **Do next** — the next likely action once the current result is known;
- **Monitor** — the observation or follow-up scan interval.

The plan may contain more stored steps, but the UI fully exposes only the current action, previews the next action, and labels later work as locked or pending.

Completing a step records its timestamp and any short result. Postponing records a new due time or date. Completion automatically appears in Progress; the user does not repeat the action in the manual Activity Log.

Plan steps have two behavioral types:

- **Action steps** are completed, postponed, or skipped. Completion unlocks the next eligible step.
- **Check steps** ask for one simple outcome from a small set generated with the plan, such as `dry`, `moist`, or `not sure`. Each option maps to a predefined next-step branch or to a re-evaluation state. The UI still exposes only the selected branch.

The initial plan is a small validated decision tree, not a free-form workflow engine. If a result falls outside its defined options, the plan asks for a new scan or a cautious re-evaluation instead of improvising treatment.

### 5. Follow-up and progress

When the lawn has had enough time to respond, the Today screen surfaces a follow-up photo action. The comparison returns an observable state:

- improving;
- unchanged;
- worsening;
- resolved;
- unable to determine.

Progress shows before-and-after photos, the observable state, a plain-language change summary, completed steps, and the next monitoring decision. It does not calculate a global lawn score.

The comparison model proposes the observable state, but the user confirms it before a plan is marked resolved, worsening, or replaced. A user may correct the proposed state. No model result silently archives or replaces the primary plan.

### 6. Resolution and maintenance mode

When the issue is resolved:

- celebrate and archive the rescue plan;
- retain its scans and timeline in Progress;
- offer a new diagnosis when the user notices another issue;
- surface only genuinely timely seasonal maintenance guidance;
- show **Nothing needs attention right now** when appropriate.

Weather or seasonal risk may prompt an inspection, but it cannot create a new primary problem automatically.

## Information architecture

Authenticated navigation has four primary destinations:

### Today

- one next best action;
- timing and weather suitability;
- active-plan progress;
- in-app due or postponed reminders;
- maintenance-mode state when there is no active plan.

### Plan

- current rescue-plan step;
- next-step preview;
- locked future steps;
- seasonal guidance in a secondary section;
- resolved-plan archive link.

### Scan

- start a diagnosis or follow-up;
- photo-quality guidance;
- scan allowance and next reset;
- recent scans and whether each belongs to the current plan.

### Progress

- before-and-after comparisons;
- observable outcome status;
- completed rescue steps;
- existing manual activities and legacy scan history;
- resolved plans.

Profile moves to the header avatar and contains lawn details, location, account controls, scan allowance, and settings.

The Guest Preview does not show the authenticated bottom navigation.

## In-app reminders

There are no outbound notifications in this milestone. A reminder is a derived state shown inside Today and Plan when:

- a step becomes due;
- a postponed step becomes due again;
- a weather constraint changes from unsuitable to suitable;
- a follow-up interval has elapsed;
- a result requires re-evaluation.

The app does not create daily engagement reminders. Where practical, reminder state should derive from plan-step dates and weather rather than requiring a separate notification subsystem.

## Scan allowance

The free policy is:

- one Guest Preview per anonymous identity;
- three personalized welcome scans during the 30 days after permanent account conversion;
- one personalized scan per 30-day allowance period beginning after the welcome period.

The Guest Preview does not consume a personalized welcome scan. The conversion re-analysis consumes the first welcome scan. Unused welcome scans expire at the end of the 30-day welcome period; monthly replenishment does not begin early if all three are used sooner. Failed analysis and unusable-photo responses do not consume a scan. A follow-up scan consumes a personalized scan.

The server stores authoritative period boundaries. The UI displays the remaining allowance and exact next reset in the user's local time. There is no paid upgrade action in this milestone; an exhausted user can still view all saved plans, steps, and progress.

Enforcement must be server-side and atomic so concurrent requests cannot bypass limits. A usage event is reserved before AI work and finalized only after a usable result. Failed work releases or refunds the reservation.

## Diagnosis contract

New diagnosis responses use a versioned contract with at least:

- `schema_version`;
- `image_usable` and optional retake guidance;
- `likely_cause`;
- `confidence` (`low`, `medium`, `high`);
- `summary`;
- `evidence[]`;
- `alternatives[]`;
- `safe_next_step`;
- `safety_notes[]`;
- product-neutral `treatment_category` or `active_ingredient` when warranted;
- `plan_seed` with ordered proposed actions and follow-up timing.

The Edge Function validates the model response before returning it. Invalid output is treated as a failed analysis and does not consume allowance. Legacy diagnosis JSON remains displayable through an adapter but is not converted into a rescue plan automatically.

## Data model

Names may be adjusted by the implementation plan, but the responsibilities and ownership boundaries are fixed.

### `lawn_cases`

One record per diagnosed problem or observation:

- owner (`user_id`);
- title and optional area label;
- status (`observation`, `active`, `monitoring`, `paused`, `resolved`, `archived`);
- primary flag;
- likely cause and confidence;
- created, updated, and resolved timestamps.

A partial unique constraint or equivalent transactional rule allows at most one primary `active` or `monitoring` case per permanent user.

### `lawn_scans`

Extend the existing table additively with:

- optional `case_id`;
- scan purpose (`initial`, `follow_up`, `observation`);
- diagnosis schema version;
- optional comparison status and summary.

Existing `diagnosis` JSON and private `storage_path` remain supported.

### `plan_steps`

- owner and case relationship;
- stable order and stage;
- title, rationale, instructions, estimated effort;
- not-before and due timing;
- optional weather constraints;
- behavioral type (`action` or `check`) and any check outcome options/branch mapping;
- status (`locked`, `ready`, `done`, `postponed`, `skipped`);
- completion or postponement timestamps;
- optional user result.

Progress derives its automatic action history from completed plan steps. Existing `activities` remain the manual maintenance history and may be linked to a case or plan step where useful, but duplicate rows are not required.

### Scan entitlement and usage records

Maintain an entitlement record for the account tier and immutable usage events for guest, welcome, and monthly scans. Usage events include a unique reservation or idempotency key, status, allowance source, timestamps, and optional scan ID.

Only server-side code may reserve or finalize allowance. The frontend may read a safe allowance summary but may not grant credits or alter tier state.

## Architecture and data flow

- Keep the existing Vite/React, React Query, Supabase, and Edge Function architecture.
- Add focused service modules for diagnosis contracts, plan state, scan allowance, and progress derivation rather than expanding page components further.
- The browser resizes photos as it does today.
- Guest Preview begins with `signInAnonymously()` and sends the resulting JWT to the Edge Function.
- The Edge Function validates the current user and anonymous/permanent state, reserves allowance atomically, calls the AI provider, validates the response, and finalizes usage.
- Guest images remain browser-local until permanent-account conversion.
- Permanent scan images use the existing private bucket and signed URLs.
- Rescue-plan creation uses validated diagnosis output and explicit server-owned defaults; users can start or decline the plan.
- Declining **Start this plan** preserves the personalized scan as an `observation` case. The user can start a plan from that observation later without another scan, subject to a warning if the diagnosis is old enough that current conditions should be rechecked.
- React Query keys must represent the complete resource contract to avoid the partial-row cache defect previously fixed in Activity Log.

## Security and privacy

- Enable Supabase anonymous sign-ins and manual identity linking only after reviewing all existing RLS policies.
- Anonymous users use the `authenticated` Postgres role. Policies that distinguish guest from permanent access must use the trusted JWT `is_anonymous` claim, never user-editable metadata.
- All exposed tables must have RLS with ownership predicates using `auth.uid()`.
- Anonymous users may access only their own guest usage state; they may not create profiles, permanent scans, cases, or plans until converted.
- Do not expose a service-role or secret key to the browser.
- If privileged database code is required for atomic allowance reservation, keep it outside the exposed schema where possible, revoke default `PUBLIC` execution, explicitly grant only the required server role, validate the caller, and run Supabase advisors.
- Apply CAPTCHA or equivalent abuse protection to anonymous sign-in and the Guest Preview entry point.
- Add a cleanup policy for abandoned anonymous auth users because Supabase does not clean them up automatically.
- Do not persist guest images before account conversion.
- Continue using private scan storage and short-lived signed URLs.

Relevant current Supabase guidance:

- <https://supabase.com/docs/guides/auth/auth-anonymous>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>

## Error and empty states

- **Unusable photo:** show specific retake instructions; consume no allowance.
- **AI or network failure:** preserve the selected photo in the active flow, allow retry, and consume no allowance.
- **Guest allowance used:** offer account creation or sign-in; do not run another guest analysis.
- **Personalized allowance exhausted:** show the next reset date while retaining full access to saved plans and progress.
- **Profile incomplete:** collect only the missing context needed for personalization.
- **No active plan:** show maintenance mode, new scan entry, and a calm no-action state.
- **No progress comparison:** explain when a follow-up will be useful instead of showing an empty chart.
- **Conflicting or uncertain evidence:** recommend observation or a low-risk check rather than treatment.
- **Lost guest session:** explain that Guest Preview data was not saved and offer a new flow subject to server allowance rules.

## Compatibility and migration

- Use additive database migrations.
- Preserve existing scan, activity, completion, profile, and storage records.
- Keep legacy scan history readable with a legacy diagnosis adapter.
- Move existing Activity Log presentation into Progress without removing manual logging.
- Move the existing seasonal checklist and schedule into a secondary Plan section.
- Existing authenticated users without an active case land in maintenance mode and can start a new diagnosis.
- Do not infer rescue plans from historical scans without the user explicitly starting one.

## Accessibility and mobile behavior

- Preserve mobile-first layouts and safe-area navigation behavior.
- All image capture flows provide gallery upload and non-camera alternatives.
- Confidence and outcome states use text and icons, not color alone.
- Primary controls meet accessible target sizing and keyboard focus requirements.
- Loading and analysis states announce progress without promising an exact completion time.
- Before/after images include descriptive labels and dates.

## Testing and acceptance

### Unit tests

- diagnosis schema validation and legacy adapter;
- plan-step state transitions;
- primary-case selection rules;
- reminder derivation;
- allowance selection, reset, reservation, finalization, and refund rules;
- progress outcome presentation.

### Integration tests

- Guest Preview success, unusable image, retry, and exhausted allowance;
- anonymous-to-permanent conversion preserving the user ID and active flow;
- profile completion leading to personalized diagnosis and plan creation;
- Today showing exactly one ready action;
- completion appearing in Progress without duplicate manual entry;
- postponement and later reappearance;
- follow-up comparison and resolution;
- action-step progression, each check-step branch, and out-of-range re-evaluation;
- explicit switching between primary plans while preserving the paused plan;
- existing-account sign-in from Guest Preview without cross-user row reassignment;
- maintenance mode with and without seasonal guidance;
- legacy scans and activities remaining visible.

### Supabase verification

- RLS tests for anonymous users, permanent users, and cross-user access denial;
- atomic concurrent allowance-reservation test;
- storage ownership and signed-URL tests;
- anonymous account cleanup procedure;
- database and security advisors before committing the final migration.

### Release acceptance

- Build, lint, type-check, and automated tests pass.
- Direct SPA routes work on Vercel.
- The complete guest-to-progress journey is smoke-tested on mobile viewport and desktop.
- No product brand is emitted by the new diagnosis contract or rendered by the new UI.
- A failed or unusable scan does not decrement allowance.
- There is never more than one primary active or monitoring plan for a user.

## Builder calls intentionally left open

The implementation plan may choose:

- exact component and hook boundaries;
- exact SQL table and enum names;
- whether timing fields use timestamps or date-plus-window structures;
- the schema-validation library and Edge Function test harness;
- the UI animation details;
- whether the guest photo is retained in memory, IndexedDB with immediate cleanup, or another browser-local mechanism that does not upload it before conversion.

These choices must preserve the flows, security boundaries, progressive disclosure, and one-primary-plan rule above.
