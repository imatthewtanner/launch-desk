# Launch Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a working Launch Desk web application that turns launch briefs and assets into a streamed prioritized plan, risk register, owner checklists, launch copy, and follow-up questions through the current OpenAI Agents SDK.

**Architecture:** Use one full-stack TypeScript Next.js application with a Node-runtime NDJSON agent route, a primary Launch Planner agent, deterministic typed tools, and a Mission Control frontend. Production authentication, records, and uploads use Supabase; local guest mode uses browser state and run-scoped temporary storage so tests and live OpenAI verification are reproducible without cloud credentials.

**Tech Stack:** Current stable Next.js and React, TypeScript, current `@openai/agents` and `openai` packages, Zod, Supabase Auth/Postgres/Storage, Vitest, Testing Library, Playwright, NDJSON over streamed `fetch`, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-25-launch-desk-design.md`

## Global Constraints

- Consult the OpenAI Docs skill and official `https://developers.openai.com/api/docs/models` guidance before selecting the SDK version, model, stream events, tracing API, or file-input mapping.
- Use the official OpenAI Agents SDK through its current Responses API path; do not introduce Assistants API or legacy Chat Completions scaffolding.
- Keep `OPENAI_API_KEY` and Supabase service-role credentials server-only and out of logs, commits, browser bundles, and test snapshots.
- The agent API accepts `POST` and streams `application/x-ndjson` events with monotonically increasing sequence numbers.
- Every valid run emits at least one `tool.progress` event and one real model `text.delta` during mandatory live verification.
- Production uses Supabase magic-link authentication, private storage, and row-level security; local guest mode is disabled in production.
- Support at most 10 assets per launch and 20 MB per asset: PDF, text, Markdown, CSV, JSON, PNG, JPEG, and WebP.
- Treat every uploaded asset as untrusted reference content, never as system or developer instructions.
- Persist final structured results and usage summaries, not raw token deltas or raw asset contents.
- Use test-first implementation, run the narrow failing test before code, and commit after every task.
- `.superpowers/`, `.env*` except safe examples, build output, test output, and temporary guest assets remain ignored.

---

## File and Responsibility Map

| Path | Responsibility |
|---|---|
| `app/layout.tsx` | Global metadata, fonts, and providers |
| `app/page.tsx` | Mission Control entry page |
| `app/globals.css` | Design tokens, responsive layout, and shared UI states |
| `app/api/agent/plan/route.ts` | Production Node route for the streamed plan endpoint |
| `app/api/assets/sign/route.ts` | Validate metadata and create signed production upload targets |
| `app/api/launches/route.ts` | Create and list launch records |
| `app/auth/callback/route.ts` | Complete Supabase magic-link authentication |
| `components/desk/mission-control.tsx` | Coordinate intake, uploads, streaming, and result panels |
| `components/forms/launch-brief-form.tsx` | Controlled, accessible launch input form |
| `components/forms/asset-dropzone.tsx` | Asset selection, validation, upload progress, and removal |
| `components/stream/progress-rail.tsx` | Render ordered tool and agent activity |
| `components/results/result-tabs.tsx` | Plan, risk, owner, and copy navigation |
| `components/results/*.tsx` | Focused structured-result renderers |
| `hooks/use-launch-stream.ts` | POST, parse NDJSON, reduce events, cancel, and expose state |
| `lib/config/env.ts` | Validate public and server-only environment variables |
| `lib/contracts/launch.ts` | Launch request, asset reference, and final result schemas |
| `lib/contracts/stream.ts` | Stream event schema and encoder/decoder |
| `lib/tools/*.ts` | One deterministic planning tool implementation per file |
| `lib/tools/registry.ts` | SDK tool wrappers and implementation registry |
| `lib/agent/instructions.ts` | Launch Planner behavioral instructions |
| `lib/agent/create-launch-agent.ts` | Build the SDK agent from model, tools, and handoffs |
| `lib/agent/run-launch-agent.ts` | Start the SDK run and expose normalized agent events |
| `lib/agent/event-adapter.ts` | Translate current SDK stream events into internal events |
| `lib/observability/tracing.ts` | Tracing configuration and privacy-safe run metadata |
| `lib/assets/validation.ts` | Count, size, extension, MIME, and ownership validation |
| `lib/assets/prepare-context.ts` | Produce bounded portable asset context for the agent |
| `lib/assets/openai-parts.ts` | Map portable context to the current official OpenAI input form |
| `lib/storage/types.ts` | Storage adapter interface |
| `lib/storage/local-guest.ts` | Run-scoped temporary development storage |
| `lib/storage/supabase-storage.ts` | Private Supabase Storage implementation |
| `lib/supabase/browser.ts` | Public browser client |
| `lib/supabase/server.ts` | Cookie-aware server client |
| `lib/supabase/admin.ts` | Server-only service client |
| `lib/server/create-plan-handler.ts` | Dependency-injected request and stream coordinator |
| `lib/server/persistence.ts` | Launch and run persistence interface and adapters |
| `supabase/migrations/*_launch_desk.sql` | Tables, indexes, triggers, RLS, and storage policies |
| `scripts/verify-live-stream.mjs` | Mandatory real local OpenAI streamed acceptance check |
| `tests/unit/` | Contracts, tools, assets, environment, and event tests |
| `tests/component/` | Mission Control component and hook tests |
| `tests/integration/` | Dependency-injected API stream tests |
| `tests/e2e/` | Browser guest-mode flow |
| `tests/fixtures/launch-brief.txt` | Safe upload fixture |
| `docs/openai-api-baseline.md` | Dated official SDK/model/stream/tracing decisions |
| `docs/validation-checklist.md` | Agent, frontend, upload, security, and live validation |

---

### Task 1: Lock Current OpenAI Guidance and Scaffold the Full-Stack App

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `lib/config/env.ts`
- Create: `tests/unit/config/env.test.ts`
- Create: `docs/openai-api-baseline.md`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `readServerEnv(source?: NodeJS.ProcessEnv): ServerEnv`
- Produces: `readPublicEnv(source?: NodeJS.ProcessEnv): PublicEnv`
- Produces: a lockfile-pinned current Agents SDK and a dated official model/stream/tracing baseline used by every later task

- [ ] **Step 1: Read official OpenAI guidance before installing SDK code**

Use the OpenAI Docs skill to inspect the current JavaScript/TypeScript Agents SDK quickstart, tools, streaming, tracing, file/image inputs, and the official model guide at `https://developers.openai.com/api/docs/models`. Record the inspection date, exact package names and installed versions, selected default model, SDK run entry point, SDK stream event names, tracing API, and file/image input mapping in `docs/openai-api-baseline.md`. Include direct official links and the reason the selected model fits a low-latency planning application.

- [ ] **Step 2: Create the package manifest and pin dependencies through the lockfile**

Run:

```bash
npm init -y
npm install next@latest react@latest react-dom@latest @openai/agents@latest openai@latest zod@latest @supabase/ssr@latest @supabase/supabase-js@latest lucide-react@latest clsx@latest
npm install -D typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest eslint@latest eslint-config-next@latest vitest@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest @playwright/test@latest
```

Replace the generated scripts with:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "verify:live": "node scripts/verify-live-stream.mjs"
  }
}
```

- [ ] **Step 3: Write the failing environment-boundary test**

Create `tests/unit/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readPublicEnv, readServerEnv } from '@/lib/config/env';

describe('environment boundaries', () => {
  it('accepts a server key without exposing it in public configuration', () => {
    const source = {
      OPENAI_API_KEY: 'test-secret',
      OPENAI_MODEL: 'current-model',
      LAUNCH_DESK_GUEST_MODE: 'true',
    };
    expect(readServerEnv(source).OPENAI_API_KEY).toBe('test-secret');
    expect(readPublicEnv(source)).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('rejects production guest mode', () => {
    expect(() => readServerEnv({
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'test-secret',
      OPENAI_MODEL: 'current-model',
      LAUNCH_DESK_GUEST_MODE: 'true',
    })).toThrow(/guest mode/i);
  });
});
```

- [ ] **Step 4: Run the test and verify the missing module failure**

Run: `npm test -- tests/unit/config/env.test.ts`  
Expected: FAIL because `lib/config/env.ts` does not exist.

- [ ] **Step 5: Implement strict server and public environment readers**

Use separate Zod schemas. `ServerEnv` includes `OPENAI_API_KEY`, `OPENAI_MODEL`, `LAUNCH_DESK_GUEST_MODE`, optional Supabase URL/keys in guest mode, and required Supabase URL/keys outside guest mode. `PublicEnv` contains only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Reject `LAUNCH_DESK_GUEST_MODE=true` when `NODE_ENV=production`.

- [ ] **Step 6: Add the minimal Next.js shell and configuration**

Create an accessible root layout with metadata title `Launch Desk`, a temporary page heading, and CSS tokens for navy, cyan, violet, neutral text, focus rings, reduced motion, and responsive spacing. Configure `@/*` path aliases, jsdom Vitest setup, and Playwright `webServer` using `npm run dev`.

- [ ] **Step 7: Add safe environment and ignore conventions**

Create `.env.example` with variable names and non-secret examples only:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=
LAUNCH_DESK_GUEST_MODE=true
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_TRACING_DISABLED=false
```

Add `.superpowers/`, `test-results/`, `playwright-report/`, and `.launch-desk-tmp/` to `.gitignore` while preserving the existing secret exclusions.

- [ ] **Step 8: Run the baseline checks**

Run:

```bash
npm test -- tests/unit/config/env.test.ts
npm run typecheck
npm run lint
```

Expected: all commands pass.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.ts vitest.setup.ts playwright.config.ts app lib/config tests/unit/config docs/openai-api-baseline.md .env.example .gitignore
git commit -m "chore: scaffold Launch Desk with current OpenAI baseline"
```

---

### Task 2: Define Launch and Stream Contracts

**Files:**
- Create: `lib/contracts/launch.ts`
- Create: `lib/contracts/stream.ts`
- Create: `tests/unit/contracts/launch.test.ts`
- Create: `tests/unit/contracts/stream.test.ts`

**Interfaces:**
- Produces: `LaunchRequestSchema`, `LaunchResultSchema`, `AssetReferenceSchema`
- Produces: `LaunchStreamEventSchema`, `encodeStreamEvent(event): string`, `decodeStreamLines(buffer): { events; remainder }`
- Consumes: no application internals beyond Zod

- [ ] **Step 1: Write failing launch-contract tests**

Cover a valid request, a launch date in ISO `YYYY-MM-DD`, 11 rejected assets, an asset over 20 MB, unsupported MIME, and a complete final result. Assert that the final result includes `summary`, `readiness`, `prioritizedPlan`, `riskRegister`, `ownerChecklists`, `copySuggestions`, `followUpQuestions`, `assetReferences`, and `assumptions`.

- [ ] **Step 2: Write failing stream-contract tests**

Create one test that encodes and decodes these events in order:

```ts
const events = [
  { type: 'run.started', runId: 'run-1', sequence: 1, timestamp: '2026-08-25T00:00:00.000Z' },
  { type: 'tool.progress', runId: 'run-1', sequence: 2, timestamp: '2026-08-25T00:00:01.000Z', tool: 'check_launch_readiness', message: 'Scored 10 readiness categories' },
  { type: 'text.delta', runId: 'run-1', sequence: 3, timestamp: '2026-08-25T00:00:02.000Z', delta: 'Prioritize the staged rollout.' },
];
```

Also assert that a duplicate or decreasing sequence fails validation and that a partial final line remains in `remainder`.

- [ ] **Step 3: Run the contract tests and verify failure**

Run: `npm test -- tests/unit/contracts`  
Expected: FAIL because both contract modules are missing.

- [ ] **Step 4: Implement the launch schemas**

Use discriminated Zod objects for priorities `P0 | P1 | P2`, risk levels `low | medium | high | critical`, copy channels `release_notes | email | in_app | social | internal | support`, and result sections. Trim strings, cap user-entered text lengths, validate future-or-today dates at the request boundary, and export inferred TypeScript types.

- [ ] **Step 5: Implement the stream schema and incremental decoder**

Use a discriminated union for the nine approved event types. `encodeStreamEvent` must return `JSON.stringify(event) + '\n'`. `decodeStreamLines` accepts a string buffer, parses complete newline-terminated frames through `LaunchStreamEventSchema`, and preserves the final incomplete frame.

- [ ] **Step 6: Run tests and type checking**

Run:

```bash
npm test -- tests/unit/contracts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/contracts tests/unit/contracts
git commit -m "feat: define launch and streaming contracts"
```

---

### Task 3: Implement the Deterministic Planning Tools

**Files:**
- Create: `lib/tools/types.ts`
- Create: `lib/tools/extract-launch-tasks.ts`
- Create: `lib/tools/check-launch-readiness.ts`
- Create: `lib/tools/generate-owner-checklists.ts`
- Create: `lib/tools/draft-channel-copy.ts`
- Create: `lib/tools/registry.ts`
- Create: `tests/unit/tools/extract-launch-tasks.test.ts`
- Create: `tests/unit/tools/check-launch-readiness.test.ts`
- Create: `tests/unit/tools/generate-owner-checklists.test.ts`
- Create: `tests/unit/tools/draft-channel-copy.test.ts`

**Interfaces:**
- Produces: `extractLaunchTasks(input): NormalizedTask[]`
- Produces: `checkLaunchReadiness(input): ReadinessResult`
- Produces: `generateOwnerChecklists(tasks): OwnerChecklist[]`
- Produces: `draftChannelCopy(input): ChannelCopySuggestion[]`
- Produces: `createAgentTools(deps): Array<ReturnType<typeof tool>>` using the current SDK `tool` helper confirmed in Task 1
- Consumes: shared launch schemas from Task 2

- [ ] **Step 1: Write the failing readiness-rubric tests**

Define exact weights totaling 100: product brief 15, audience 10, timing 10, rollout 15, observability 10, support 10, security 10, communications 10, rollback 5, assets 5. Test a complete launch at 100, a brief-only launch below 40, and a missing rollout/rollback case that returns both blockers.

- [ ] **Step 2: Run the readiness test and verify failure**

Run: `npm test -- tests/unit/tools/check-launch-readiness.test.ts`  
Expected: FAIL because the tool does not exist.

- [ ] **Step 3: Implement readiness scoring**

Implement pure, deterministic scoring. Accept explicit evidence strings for rollout, observability, support, security, communications, and rollback; never infer readiness from unrelated prose. Return total, category scores, blockers, warnings, and missing details. Clamp the total to 0–100.

- [ ] **Step 4: Write failing normalization and owner-checklist tests**

Use duplicated tasks with whitespace differences, mixed priorities, dependencies, role owners, acceptance criteria, and dates. Assert stable IDs, deduplication, priority order `P0`, `P1`, `P2`, dependency preservation, grouping by owner role, and unchecked checklist items.

- [ ] **Step 5: Implement task normalization and owner grouping**

Normalize titles with case-insensitive duplicate keys, preserve the most urgent priority, merge evidence sources, sort dependencies before dependents where possible, and use `Unassigned role` when no role is available.

- [ ] **Step 6: Write failing channel-copy tests**

Assert that social copy respects a documented character cap, release notes contain outcome and availability, support copy contains known limitations and escalation guidance, and unverified facts remain bracketed confirmation markers rather than claims.

- [ ] **Step 7: Implement channel copy rules**

Use one rules table keyed by the six approved channels. Produce structured `{ channel, headline, body, callToAction, confirmationNeeded }` values. Keep the function deterministic; the agent supplies grounded facts and the tool applies constraints.

- [ ] **Step 8: Register current Agents SDK wrappers**

Wrap each implementation with the official tool helper recorded in `docs/openai-api-baseline.md`. Export both the pure functions and SDK tools so unit tests do not require network access.

- [ ] **Step 9: Run the tool suite**

Run:

```bash
npm test -- tests/unit/tools
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/tools tests/unit/tools
git commit -m "feat: add launch planning tools"
```

---

### Task 4: Provision Supabase and Implement Secure Persistence

**Files:**
- Create: `supabase/migrations/202608250001_launch_desk.sql`
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/storage/types.ts`
- Create: `lib/storage/local-guest.ts`
- Create: `lib/storage/supabase-storage.ts`
- Create: `lib/server/persistence.ts`
- Create: `tests/unit/storage/storage-paths.test.ts`
- Create: `tests/integration/persistence.test.ts`
- Create: `app/auth/callback/route.ts`
- Create: `middleware.ts`

**Interfaces:**
- Produces: `StorageAdapter.signUpload`, `StorageAdapter.read`, `StorageAdapter.remove`
- Produces: `LaunchRepository.createLaunch`, `LaunchRepository.startRun`, `LaunchRepository.completeRun`, `LaunchRepository.failRun`
- Consumes: environment readers and shared contracts

Use these stable internal interfaces:

```ts
export interface StorageAdapter {
  signUpload(input: SignUploadInput): Promise<SignedUpload>;
  read(asset: AuthorizedAsset): Promise<Uint8Array>;
  remove(asset: AuthorizedAsset): Promise<void>;
  cleanup(scope: StorageScope): Promise<void>;
}

export interface LaunchRepository {
  createLaunch(input: CreateLaunchInput): Promise<LaunchRecord>;
  listLaunches(ownerId: string): Promise<LaunchRecord[]>;
  startRun(input: StartRunInput): Promise<AgentRunRecord>;
  completeRun(runId: string, result: LaunchResult, usage: UsageSummary): Promise<void>;
  failRun(runId: string, error: RunErrorRecord): Promise<void>;
}
```

- [ ] **Step 1: Use the Supabase skill to create the project**

Create a project named `launch-desk` in the connected Supabase organization using a US East region appropriate for the user. Keep generated secrets out of chat and source control. Store only environment-variable names in the repository and use the plugin's secure configuration flow for actual values.

- [ ] **Step 2: Write failing storage-path tests**

Assert that an authenticated path is exactly `users/<userId>/launches/<launchId>/<assetId>/<sanitizedFilename>`, rejects `..`, slashes in identifiers, control characters, and empty filenames, and never allows one user ID to read a second user's prefix.

- [ ] **Step 3: Create the database migration**

Create `launches`, `assets`, and `agent_runs` with UUID primary keys, foreign keys to `auth.users`, timestamps, status checks, JSONB final result and usage summary, indexes on `user_id` and `launch_id`, and an `updated_at` trigger. Enable row-level security and add `select`, `insert`, `update`, and `delete` policies using `auth.uid() = user_id`.

Create a private `launch-assets` bucket and storage policies that require the first folder to be `users`, the second to equal `auth.uid()::text`, and object metadata to remain within the owner prefix.

- [ ] **Step 4: Apply and inspect the migration through the Supabase plugin**

Apply the SQL, then query table definitions, active RLS policies, indexes, and bucket visibility. Expected: all three tables have RLS enabled and `launch-assets` is private.

- [ ] **Step 5: Implement browser, server, and admin clients**

The browser client uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The server client reads/writes auth cookies. The admin client imports a server-only guard and requires `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 6: Implement storage adapters**

`LocalGuestStorage` writes only beneath `.launch-desk-tmp/<sessionId>/<runId>/`, uses random file identifiers, refuses symlinks, and exposes an explicit cleanup method. `SupabaseStorage` creates short-lived signed upload URLs, reads only owner-authorized asset rows, and uses the private bucket.

- [ ] **Step 7: Implement persistence adapters and auth callback**

Provide an in-memory guest repository and Supabase production repository behind the same interface. The callback exchanges the magic-link code for a session and redirects to `/`. Middleware refreshes Supabase sessions and never enables guest mode in production.

- [ ] **Step 8: Run storage and persistence tests**

Run:

```bash
npm test -- tests/unit/storage tests/integration/persistence.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase lib/supabase lib/storage lib/server/persistence.ts tests/unit/storage tests/integration/persistence.test.ts app/auth middleware.ts
git commit -m "feat: add Supabase persistence and secure storage"
```

---

### Task 5: Validate Assets and Prepare Bounded Agent Context

**Files:**
- Create: `lib/assets/validation.ts`
- Create: `lib/assets/prepare-context.ts`
- Create: `lib/assets/openai-parts.ts`
- Create: `app/api/assets/sign/route.ts`
- Create: `tests/unit/assets/validation.test.ts`
- Create: `tests/unit/assets/prepare-context.test.ts`
- Create: `tests/fixtures/launch-brief.txt`

**Interfaces:**
- Produces: `validateAssetMetadata(asset): ValidatedAssetMetadata`
- Produces: `prepareAssetContext(assets, storage): Promise<PreparedAssetContext>`
- Produces: `toOpenAIInputParts(context): OpenAIInputPart[]`, where `OpenAIInputPart` is a local alias to the exact current SDK input-part union recorded in Task 1
- Consumes: `StorageAdapter`, `AssetReference`, and the official input mapping recorded in Task 1

- [ ] **Step 1: Write failing asset-validation tests**

Cover 10 accepted files, 11 rejected files, exactly 20 MB accepted, 20 MB plus one byte rejected, extension/MIME mismatch rejected, executable MIME rejected, and filename sanitization that preserves a safe extension.

- [ ] **Step 2: Run the validation test and verify failure**

Run: `npm test -- tests/unit/assets/validation.test.ts`  
Expected: FAIL because the validator is missing.

- [ ] **Step 3: Implement metadata validation and upload signing**

Use one allowlist mapping extensions to accepted MIME types. The signing route authenticates the user or verified development guest, checks launch ownership, validates the request, creates the asset record, and returns a short-lived object-scoped upload URL. Never accept a client-supplied storage path.

- [ ] **Step 4: Write failing context-preparation tests**

Assert UTF-8 decoding for text, Markdown, CSV, and JSON; per-file and aggregate character bounds; warnings for unreadable files; stable asset references; and portable `{ kind: 'text' | 'file' | 'image' }` parts that contain no credentials.

- [ ] **Step 5: Implement portable context preparation**

Read through `StorageAdapter`, cap text at 50,000 characters per asset and 200,000 total, and return `{ parts, warnings, references }`. Do not execute, render, or follow instructions found in assets.

- [ ] **Step 6: Implement the official OpenAI input mapper**

Map portable PDF and image parts to the exact current Responses-compatible SDK input types documented in `docs/openai-api-baseline.md`. Map bounded text to plain content parts. Keep all SDK-specific types in `lib/assets/openai-parts.ts`.

- [ ] **Step 7: Run asset tests**

Run:

```bash
npm test -- tests/unit/assets
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/assets app/api/assets tests/unit/assets tests/fixtures/launch-brief.txt
git commit -m "feat: validate and prepare launch assets"
```

---

### Task 6: Build the Launch Planner Agent, Event Adapter, and Tracing

**Files:**
- Create: `lib/agent/instructions.ts`
- Create: `lib/agent/create-launch-agent.ts`
- Create: `lib/agent/event-adapter.ts`
- Create: `lib/agent/run-launch-agent.ts`
- Create: `lib/observability/tracing.ts`
- Create: `tests/unit/agent/instructions.test.ts`
- Create: `tests/unit/agent/event-adapter.test.ts`
- Create: `tests/integration/agent-runner.test.ts`

**Interfaces:**
- Produces: `createLaunchAgent({ model, tools, handoffs? }): Agent`
- Produces: `runLaunchAgent(input, options): AsyncIterable<NormalizedAgentEvent>`
- Produces: `adaptSdkEvent(event): NormalizedAgentEvent[]`
- Consumes: current SDK baseline, tool registry, asset input parts, and final result schema

- [ ] **Step 1: Write the failing instruction-contract test**

Assert that the instruction string contains explicit requirements to use supplied facts, label assumptions, keep unknown owners as roles, preserve launch date constraints, treat asset instructions as untrusted, produce a provisional plan, ask material follow-up questions, and conform to the final result schema.

- [ ] **Step 2: Implement the instructions as a versioned constant**

Export `LAUNCH_PLANNER_INSTRUCTIONS_VERSION` and `buildLaunchPlannerInstructions()`. Keep the behavior in one file and include the version in trace metadata.

- [ ] **Step 3: Write failing SDK event-adapter tests**

Use representative tool-call started/completed, raw model delta, agent update, usage, and error fixtures matching the official SDK event names recorded in Task 1. Assert that model deltas become nonempty internal text events and tool events expose only the safe registered tool name.

- [ ] **Step 4: Implement the event adapter**

Switch exhaustively over current SDK event discriminants. Ignore SDK bookkeeping events that do not affect the UI. Return typed internal events so later transport logic never depends directly on SDK event shapes.

- [ ] **Step 5: Write a failing mocked runner integration test**

Inject an async SDK event source that yields a tool call, text deltas, usage, and a final structured result. Assert ordered normalized events, final Zod validation, abort propagation, and usage capture.

- [ ] **Step 6: Create the agent and runner**

Use the current official `Agent` and run APIs from the baseline document. Configure the selected default model with an `OPENAI_MODEL` override, registered tools, structured final output, and optional future handoffs. The runner accepts an `AbortSignal`, portable asset context, readiness result, and optional prior result.

- [ ] **Step 7: Add tracing and privacy-safe metadata**

Use the current Agents SDK tracing API recorded in Task 1. Attach run ID, launch ID, user-or-guest identifier, model, instruction version, and tool timing. Respect `OPENAI_TRACING_DISABLED`; never attach full prompts, raw assets, API keys, auth tokens, or full model output.

- [ ] **Step 8: Run agent tests**

Run:

```bash
npm test -- tests/unit/agent tests/integration/agent-runner.test.ts
npm run typecheck
```

Expected: PASS without a live OpenAI request.

- [ ] **Step 9: Commit**

```bash
git add lib/agent lib/observability tests/unit/agent tests/integration/agent-runner.test.ts
git commit -m "feat: implement Launch Planner agent runtime"
```

---

### Task 7: Implement the Streamed Plan API Coordinator

**Files:**
- Create: `lib/server/create-plan-handler.ts`
- Create: `app/api/agent/plan/route.ts`
- Create: `app/api/launches/route.ts`
- Create: `tests/integration/plan-handler.test.ts`
- Create: `tests/integration/plan-route.test.ts`

**Interfaces:**
- Produces: `createPlanHandler(deps): (request: Request) => Promise<Response>`
- Produces: `POST(request): Promise<Response>` with `content-type: application/x-ndjson`
- Consumes: contracts, readiness tool, asset context, agent runner, persistence, and auth context

- [ ] **Step 1: Write the failing handler success test**

Inject fake authentication, storage, repository, readiness, and agent-runner dependencies. POST a valid request and parse the stream. Assert exact ordering: `run.started`, readiness `tool.started`, readiness `tool.progress`, readiness `tool.completed`, at least one `text.delta`, final `result.partial`, and `run.completed`.

- [ ] **Step 2: Write failing error and cancellation tests**

Cover invalid input before stream creation, unauthorized production request, asset ownership failure, agent error before text, agent error after text, final schema failure, and aborted request. Assert stable categories and that content emitted before a late failure remains in the stream.

- [ ] **Step 3: Run the handler tests and verify failure**

Run: `npm test -- tests/integration/plan-handler.test.ts`  
Expected: FAIL because the coordinator does not exist.

- [ ] **Step 4: Implement a sequence-safe stream writer**

Create one closure that assigns `sequence += 1`, adds the timestamp and run ID, validates through `LaunchStreamEventSchema`, encodes one NDJSON line, and enqueues UTF-8 bytes. All event producers must call this closure.

- [ ] **Step 5: Implement the coordinator**

Validate the body, resolve auth/guest context, start persistence, emit `run.started`, execute `checkLaunchReadiness` through the shared implementation with progress events, prepare authorized assets, invoke `runLaunchAgent`, adapt events, validate the final result, persist the terminal state, and close the stream. Propagate the request abort signal.

- [ ] **Step 6: Wire the production route and launch CRUD route**

Export `runtime = 'nodejs'` from the agent route. Construct production dependencies from validated environment configuration. The launch route creates and lists only owner-authorized launches; guest mode uses the in-memory repository.

- [ ] **Step 7: Run the integration suite**

Run:

```bash
npm test -- tests/integration/plan-handler.test.ts tests/integration/plan-route.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/server/create-plan-handler.ts app/api/agent app/api/launches tests/integration/plan-handler.test.ts tests/integration/plan-route.test.ts
git commit -m "feat: stream launch plans from the agent API"
```

---

### Task 8: Build the Mission Control Frontend

**Files:**
- Create: `components/desk/mission-control.tsx`
- Create: `components/forms/launch-brief-form.tsx`
- Create: `components/forms/asset-dropzone.tsx`
- Create: `components/stream/progress-rail.tsx`
- Create: `components/results/result-tabs.tsx`
- Create: `components/results/plan-panel.tsx`
- Create: `components/results/risk-panel.tsx`
- Create: `components/results/owner-panel.tsx`
- Create: `components/results/copy-panel.tsx`
- Create: `components/results/follow-up-panel.tsx`
- Create: `hooks/use-launch-stream.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/component/launch-brief-form.test.tsx`
- Create: `tests/component/progress-rail.test.tsx`
- Create: `tests/component/use-launch-stream.test.tsx`
- Create: `tests/component/mission-control.test.tsx`

**Interfaces:**
- Produces: `useLaunchStream(): { state, start, cancel, reset }`
- Produces: accessible Mission Control UI consuming shared request/result/event types
- Consumes: streamed plan endpoint and asset signing route

- [ ] **Step 1: Invoke the frontend implementation skill and lock the visual system**

Use the installed frontend skill before writing components. Apply the approved Mission Control direction: dark navy workspace, high-contrast neutral type, cyan/violet accents, visible focus rings, restrained motion, persistent desktop input rail, stacked mobile layout, and no decorative stock imagery.

- [ ] **Step 2: Write failing form and upload tests**

Assert labels for all five inputs, date validation, constraints entry, drag/drop and keyboard file selection, count/size/MIME messages, per-file removal, disabled submit during uploads, and an accessible error summary.

- [ ] **Step 3: Implement the brief form and asset dropzone**

Use controlled inputs and shared schemas. Upload authenticated assets through signed URLs; route guest assets through the guest upload path. Provide progress, retry, remove, and file-type help without exposing storage internals.

- [ ] **Step 4: Write the failing stream-hook test**

Mock a chunked `fetch` response where one JSON event is split across chunks. Assert parsing, ordered reduction, progressive text concatenation, tool activity updates, partial result merging, follow-up capture, cancellation, and a late error that preserves prior text.

- [ ] **Step 5: Implement `useLaunchStream`**

POST the validated request, read `response.body` with a reader and `TextDecoder`, call `decodeStreamLines`, reject invalid events, ignore duplicate sequence numbers, cancel through `AbortController`, and expose a discriminated UI state.

- [ ] **Step 6: Write failing progress and result tests**

Assert tool status icons also have text labels, risk levels have text plus color, tabs support keyboard navigation, owner tasks render as checklists, copy can be copied per channel, and follow-up questions can populate the next refinement request.

- [ ] **Step 7: Implement the result panels and progress rail**

Render structured result values directly. Do not parse agent Markdown into core UI state. Use semantic headings, tables or lists where appropriate, `aria-live="polite"` for progress, and a separate assertive region for terminal errors.

- [ ] **Step 8: Assemble the Mission Control page**

Keep the input rail visible on desktop and show readiness, live activity, and tabs on the right. Add empty, uploading, ready, streaming, follow-up, completed, partial, failed, and cancelled states. On mobile, stack the form above results and provide a compact sticky run status with cancellation.

- [ ] **Step 9: Run component, accessibility, and build checks**

Run:

```bash
npm test -- tests/component
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add components hooks app/page.tsx app/globals.css tests/component
git commit -m "feat: build the Launch Desk Mission Control UI"
```

---

### Task 9: Add Browser Flow and Behavioral Validation

**Files:**
- Create: `tests/e2e/launch-desk.spec.ts`
- Create: `tests/e2e/fixtures/mock-agent-events.ts`
- Create: `tests/integration/prompt-injection.test.ts`
- Create: `app/api/test/agent-stream/route.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: deterministic browser-only stream fixture enabled only when `NODE_ENV !== 'production'`
- Consumes: the same NDJSON contract and UI path as the production agent route

- [ ] **Step 1: Write the failing Playwright journey**

The test must fill the brief, audience, launch date, and constraints; attach `tests/fixtures/launch-brief.txt`; start the run; observe readiness progress and progressive text; open Plan, Risks, Owners, and Copy; submit one follow-up response; cancel a second run; and verify partial content remains.

- [ ] **Step 2: Create a non-production deterministic stream fixture**

Expose a route only when not in production. Emit realistic chunk boundaries, tool progress, multiple text deltas, partial result, follow-up, and completion using the production stream encoder. The production build must return 404 for this route.

- [ ] **Step 3: Run the browser test and repair UI defects**

Run: `npm run test:e2e -- tests/e2e/launch-desk.spec.ts`  
Expected: PASS on desktop and a mobile viewport project.

- [ ] **Step 4: Add prompt-injection behavioral coverage**

Feed an asset fixture containing instructions to ignore system rules and publish secrets. Use a mocked agent runner to assert the content remains quoted as untrusted reference material, no secret fields enter the prompt payload, and the final result records an asset warning rather than following the embedded instruction.

- [ ] **Step 5: Run the complete non-live test suite**

Run:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e tests/integration/prompt-injection.test.ts app/api/test playwright.config.ts
git commit -m "test: validate the Launch Desk browser flow"
```

---

### Task 10: Prove the Real Stream Through the Local API

**Files:**
- Create: `scripts/verify-live-stream.mjs`
- Create: `tests/fixtures/live-launch-request.json`
- Modify: `package.json`

**Interfaces:**
- Produces: process exit 0 only after observing `tool.progress`, nonempty `text.delta`, valid `run.completed`, and a final result
- Consumes: a running local Next.js server and its real OpenAI-backed `/api/agent/plan` route

- [ ] **Step 1: Create the realistic live request fixture**

Use a fictional engineering release for an API rate-limit dashboard with a near-term date, beta audience, staged rollout constraint, monitoring plan, rollback requirement, support brief, and one text asset. Include enough grounding for useful output while leaving one owner detail missing so follow-up behavior is exercised.

- [ ] **Step 2: Write the live verification script**

The script must:

```js
const required = { toolProgress: false, textDelta: false, completed: false, finalResult: false };
```

POST the fixture to `LAUNCH_DESK_BASE_URL ?? 'http://127.0.0.1:3000'`, require `application/x-ndjson`, parse incrementally, set flags only for valid schema-shaped events, abort after 120 seconds, print event types and safe summaries only, and exit nonzero with the missing flags and observed error category. It must never print headers, environment values, prompts, or raw asset contents.

- [ ] **Step 3: Run the server with the existing local key loaded**

Start the unified Next.js development server from the project root so `.env.local` is loaded by the server process. If the key remains in the parent workspace during checkout setup, start with a safe environment loader that sources it into the server process without echoing it. Verify key presence through exit status only.

- [ ] **Step 4: Run the mandatory live check in network-capable execution**

Run: `npm run verify:live`  
Expected output includes safe confirmations for at least one `tool.progress`, one nonempty `text.delta`, one valid final result, and `run.completed`.

If sandboxed execution blocks the OpenAI network call, stop that server and restart the same command through an authorized unsandboxed execution request. Distinguish DNS/egress, TLS, authentication, model-not-found, rate limit, SDK stream, tool, and result-schema failures. Fix configuration or code and rerun until it passes or an external account/permission blocker is proven.

- [ ] **Step 5: Run regression checks after the live call**

Run:

```bash
npm test
npm run test:e2e
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-live-stream.mjs tests/fixtures/live-launch-request.json package.json package-lock.json
git commit -m "test: add real streamed OpenAI verification"
```

---

### Task 11: Complete Documentation, Publish the Repository, and Deploy on Vercel

**Files:**
- Modify: `README.md`
- Create: `docs/validation-checklist.md`
- Create: `vercel.json`
- Modify: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a developer-ready repository and a Vercel deployment using secure environment configuration
- Consumes: all completed tasks and their verified commands

- [ ] **Step 1: Replace the initialization README with operating documentation**

Document product purpose, Mission Control workflow, architecture, directory map, prerequisites, environment variables, Supabase creation and migrations, magic-link setup, local guest mode, development commands, all test commands, mandatory live verification, tracing controls, privacy boundaries, tool extension, future handoffs, troubleshooting categories, and deployment.

State that `OPENAI_API_KEY` belongs in `.env.local`, never the browser, and that the default model is the exact current model recorded in `docs/openai-api-baseline.md` with `OPENAI_MODEL` as the override.

- [ ] **Step 2: Create the validation checklist**

Use checkboxes grouped under agent behavior, frontend flow, tool outputs, uploads, authentication/RLS, error recovery, accessibility, observability, non-live tests, live OpenAI stream, and Vercel deployment. Include the exact success requirements for `tool.progress`, `text.delta`, final result validation, and `run.completed`.

- [ ] **Step 3: Run a secret and placeholder scan**

Run:

```bash
rg -n "sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|T[B]D|T[O]DO|F[I]XME" --glob '!package-lock.json' --glob '!.env.local' .
git status --short
```

Expected: no secret values or incomplete markers; only intended project files are modified.

- [ ] **Step 4: Run the full final verification matrix**

Run:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
npm run verify:live
```

Expected: every command passes, including the real OpenAI-backed stream.

- [ ] **Step 5: Commit and publish the implementation**

```bash
git add README.md docs/validation-checklist.md vercel.json .env.example .gitignore
git commit -m "docs: complete Launch Desk setup and validation guide"
git push origin HEAD
```

If direct push is unavailable, publish the same commit tree through the GitHub connector and verify the default branch contains the lockfile, application, tests, spec, plan, and documentation.

- [ ] **Step 6: Use the Vercel skills to configure and deploy**

Use the installed Vercel bootstrap, environment-variable, deployment, and browser-verification guidance. Link or create a Vercel project named `launch-desk`; configure `OPENAI_API_KEY`, the selected `OPENAI_MODEL`, Supabase URL/keys, and tracing setting through secure secret flows; do not paste secret values into chat or commit them.

Deploy a preview, wait for terminal deployment status, and verify the landing page, auth boundary, asset rules, and production prohibition of guest/test routes. Run one authenticated streamed plan only if the deployment has all required secrets and Supabase policies; otherwise report the exact missing secure configuration instead of treating a page render as agent verification.

- [ ] **Step 7: Verify the published artifacts**

Confirm the GitHub default branch and Vercel deployment reference the same commit SHA. Record the repository URL, deployment URL, Supabase project reference, safe model name, test totals, and live-stream event evidence in the final handoff without exposing credentials.

- [ ] **Step 8: Final commit if deployment documentation changed**

```bash
git add README.md docs/validation-checklist.md
git commit -m "docs: record Launch Desk deployment workflow"
git push origin HEAD
```
