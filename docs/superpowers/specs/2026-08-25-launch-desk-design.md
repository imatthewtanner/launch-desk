# Launch Desk Design Specification

Date: 2026-08-25  
Repository: `imatthewtanner/launch-desk`  
Status: Approved design awaiting implementation planning

## 1. Purpose

Launch Desk is a launch-planning agent application for engineering teams. It turns a rough product brief into an actionable release plan while making uncertainty visible. A user supplies a product brief, audience, launch date, constraints, and available assets. The application streams agent progress and produces:

- A prioritized release plan
- A launch-readiness score and missing-input assessment
- A risk register
- Owner-specific checklists
- Channel-specific launch copy
- Follow-up questions for material gaps

When information is incomplete, Launch Desk produces a clearly labeled provisional plan and asks focused follow-up questions. It does not block all output or silently invent missing facts.

## 2. Approved Product Decisions

- Full-stack Next.js application using TypeScript, the App Router, and the Node runtime
- Current OpenAI Agents SDK with the Responses API model path
- No Assistants API or legacy Chat Completions scaffolding
- Mission Control layout with persistent inputs and progressive results
- Supabase Auth, Postgres, and Storage for production persistence
- Email magic-link authentication in production
- Local-development guest mode for repeatable local and automated testing
- Persistent cloud asset storage for authenticated users
- A provisional plan plus follow-up questions when inputs are incomplete
- One primary Launch Planner agent with extension points for future handoffs
- Structured streamed events for tool progress and model text
- Agents SDK tracing where supported, augmented by privacy-safe structured logs
- Vercel-ready deployment architecture

## 3. Scope

### 3.1 Included

- Responsive launch-intake interface
- Authenticated production workspaces and local guest mode
- Direct-to-storage asset uploads using signed URLs
- One streamed launch-planning agent route
- Four typed planning tools
- Progressive plan, risk, owner, and copy views
- Follow-up refinement runs
- Run and result persistence
- Agent tracing and structured operational logging
- Unit, component, API integration, browser, and live OpenAI verification
- Developer documentation and validation checklist
- Supabase project configuration, schema, storage policies, and migrations

### 3.2 Explicit Non-Goals

- Organization invitations, billing, or role administration
- Real-time multi-user editing
- Drag-and-drop project management boards
- Background job queues or resumable worker infrastructure
- Automatic publishing to launch channels
- Fine-tuning or custom model training
- Multiple specialist agents in the first release
- Permanent storage of raw token deltas

These remain extension opportunities rather than first-release requirements.

## 4. System Architecture

The application is a single Next.js repository. Browser and server responsibilities remain separate even though they deploy together.

### 4.1 Browser Responsibilities

- Render the Mission Control interface
- Validate required form fields before submission
- Request signed upload URLs and upload files directly to storage
- Open and parse the agent event stream
- Render progress and partial results without waiting for completion
- Allow cancellation through an abort signal
- Preserve current guest-mode form and result state in browser storage
- Never receive or expose `OPENAI_API_KEY` or Supabase service-role credentials

### 4.2 Server Responsibilities

- Revalidate all request fields and asset references
- Resolve authenticated or local guest context
- Enforce file ownership, type, count, and size rules
- Run the readiness preflight tool
- Configure and execute the OpenAI Agents SDK agent
- Translate SDK events into the Launch Desk stream contract
- Validate the final structured result
- Persist run summaries and final results
- Emit tracing and structured operational logs

### 4.3 Project Boundaries

```text
app/
  (auth)/                  Magic-link authentication screens
  (desk)/                  Mission Control pages
  api/assets/              Upload-signing and asset routes
  api/launches/            Launch CRUD routes
  api/agent/plan/          Streamed agent route
components/
  desk/                    Mission Control components
  forms/                   Intake and refinement controls
  results/                 Plan, risk, owner, and copy panels
  stream/                  Progress and event rendering
lib/
  agent/                   Agent, runner, event adapter, tracing
  assets/                  Asset validation and model-context adapters
  contracts/               Shared Zod schemas and TypeScript types
  storage/                 Guest and Supabase storage adapters
  supabase/                Browser/server clients and auth helpers
  tools/                   Isolated planning tool implementations
  observability/           Structured logging and trace helpers
supabase/
  migrations/              Database schema and row-level policies
  seed.sql                  Optional safe development seed data
tests/
  unit/                    Contracts and tool behavior
  component/               Mission Control interactions
  integration/             Stream route and persistence boundaries
  e2e/                     Browser guest flow
  live/                    Real OpenAI streamed verification
```

Files will remain focused around these boundaries so tools, storage providers, models, and future agent handoffs can change independently.

## 5. Mission Control Experience

### 5.1 Desktop Layout

The page uses a persistent two-column workspace:

- Left column: brief, audience, date, constraints, assets, and primary run action
- Right column: readiness summary, live progress rail, and result tabs
- Result tabs: Plan, Risks, Owners, and Copy
- Follow-up questions appear below the relevant result and in a consolidated refinement panel

### 5.2 Mobile Layout

The form stacks above results. A compact sticky status bar shows run state and provides cancellation. Result tabs become a horizontally scrollable tab list while maintaining accessible keyboard behavior.

### 5.3 Visual Direction

The interface uses a dark navy workspace, high-contrast neutral typography, restrained cyan and violet accents, compact technical data displays, and generous spacing around primary actions. Color is never the only indicator for priority, status, risk, or validation.

### 5.4 UI States

- Empty workspace
- Draft with validation guidance
- Uploading with per-file progress
- Ready to run
- Streaming with tool and model activity
- Awaiting follow-up response
- Completed
- Partially completed with recoverable error
- Failed before output
- Cancelled

The interface preserves usable partial output whenever a stream fails after content has begun.

## 6. Asset Upload Design

### 6.1 First-Release Limits

- Maximum 10 files per launch
- Maximum 20 MB per file
- Supported types: PDF, plain text, Markdown, CSV, JSON, PNG, JPEG, and WebP

Unsupported files are rejected before upload and again on the server. File extensions are not trusted without matching MIME validation.

### 6.2 Production Flow

1. The browser requests a signed upload target.
2. The server validates authentication, file metadata, and launch ownership.
3. The browser uploads directly to a private Supabase Storage bucket.
4. The server records asset metadata in Postgres.
5. The agent route resolves only asset records owned by the current user.

### 6.3 Local Guest Flow

Local guest mode writes allowed files to a run-scoped temporary directory through a storage adapter. Files are removed when their development session expires. This mode exists only outside production and does not weaken production authentication or storage policies.

### 6.4 Content Trust Boundary

Asset content is untrusted reference material. Agent instructions explicitly prohibit treating instructions embedded in assets as system or developer directives. Logs contain filenames and safe metadata, not raw asset contents.

### 6.5 Agent Context Preparation

Plain text, Markdown, CSV, and JSON are decoded server-side with bounded per-file and total character limits. PDF and image assets are represented with the current official Responses-compatible file or image input form verified during implementation. The asset adapter returns normalized references, safe metadata, and any extracted text; unsupported or unreadable content produces an explicit asset warning instead of being silently ignored.

## 7. Data Model

Production persistence uses the following tables:

### `launches`

- `id`
- `user_id`
- `title`
- `product_brief`
- `audience`
- `launch_date`
- `constraints`
- `status`
- `created_at`
- `updated_at`

### `assets`

- `id`
- `launch_id`
- `user_id`
- `storage_path`
- `filename`
- `mime_type`
- `byte_size`
- `created_at`

### `agent_runs`

- `id`
- `launch_id`
- `user_id`
- `parent_run_id` for follow-up refinements
- `status`
- `model`
- `trace_id`
- `started_at`
- `completed_at`
- `error_category`
- `usage_summary`
- `final_result` as validated JSON

Raw text deltas and uploaded content are not persisted in `agent_runs`. Row-level policies limit all three tables to records owned by the authenticated user.

## 8. Agent Design

### 8.1 Primary Agent

The Launch Planner agent receives:

- Validated launch inputs
- Readiness preflight result
- Authorized asset references and extracted context
- Any prior final result for a refinement run
- Strict behavioral instructions and output schema

The agent must:

- Prefer supplied facts over assumptions
- Label assumptions explicitly
- Use owner roles when personal owners are unknown
- Preserve launch-date constraints
- Identify conflicts between date, scope, assets, and readiness
- Produce a useful provisional plan when details are missing
- Ask only questions that materially affect launch decisions
- Avoid claiming completion of work that the supplied evidence does not support

The final response is validated against a shared structured schema before persistence and completion.

### 8.2 Tool Registry

#### `extract_launch_tasks`

Accepts candidate work items inferred by the agent and returns normalized tasks with priority, owner role, dependencies, timing, acceptance criteria, and evidence source.

#### `check_launch_readiness`

Scores a documented rubric covering product definition, audience, rollout, observability, support, security, communications, rollback, and asset readiness. It returns category scores, blocking gaps, warnings, and a total score. The coordinator always invokes this implementation before the model handoff and streams its progress.

#### `generate_owner_checklists`

Groups normalized work by owner role. It removes duplicate actions, preserves dependencies, and emits checkable items with due guidance and acceptance criteria.

#### `draft_channel_copy`

Applies channel constraints and produces drafts for release notes, email, in-app messaging, social posts, internal announcements, and support briefs. Drafts distinguish verified claims from placeholders requiring confirmation.

Each tool has one exported implementation, one SDK registration wrapper, one input schema, one output schema, and direct unit tests.

### 8.3 Handoff Extension Point

The primary agent is constructed through a factory that accepts a tool registry and optional handoffs. Future readiness, security, or communications specialists can be added without changing the API stream contract or UI result schema.

## 9. Streaming Contract

The API accepts a `POST` request and returns newline-delimited JSON using `application/x-ndjson`, with one typed event per line. The browser consumes the response through `fetch` and an incremental stream reader. This supports a structured request body, cancellation, and progressive rendering without maintaining a second EventSource endpoint.

Event types:

- `run.started`
- `tool.started`
- `tool.progress`
- `tool.completed`
- `text.delta`
- `result.partial`
- `follow_up`
- `run.completed`
- `error`

Every event contains `runId`, an increasing `sequence`, and a timestamp. Tool events additionally include a safe tool name and phase. Error events contain a stable category, retryability, and user-safe message.

The route guarantees at least one readiness-tool progress event for every valid run. Model text is forwarded as nonempty `text.delta` events when provided by the SDK. The final completion event is emitted only after output-schema validation succeeds.

## 10. Final Result Contract

The result schema contains:

- `summary`
- `readiness` with total score, category scores, blockers, warnings, and missing details
- `prioritizedPlan` with phases and normalized tasks
- `riskRegister` with likelihood, impact, mitigation, trigger, and owner role
- `ownerChecklists`
- `copySuggestions` grouped by channel
- `followUpQuestions` with rationale and affected sections
- `assetReferences`
- `assumptions`

The UI renders this schema directly rather than parsing presentation Markdown.

## 11. Error Handling

### 11.1 Validation Errors

Invalid requests return field-level issues before a run begins. Asset ownership or MIME failures return stable error categories without exposing storage internals.

### 11.2 OpenAI Failures

Authentication, unavailable model, rate limit, network, timeout, tool, stream, and schema errors are categorized separately. A safe automatic retry is allowed only before user-visible model output begins. Once text has streamed, the partial result remains visible and the run is marked partial or failed.

### 11.3 Cancellation

The browser closes the request through an abort signal. The server propagates cancellation to the runner when supported, stops persistence work, and marks the run cancelled.

### 11.4 Supabase Failures

Upload and persistence errors do not silently downgrade production users into guest storage. The UI preserves their form data and offers a targeted retry.

## 12. Security and Privacy

- `OPENAI_API_KEY` is loaded only by the server process.
- Supabase service-role credentials remain server-only.
- Production routes require a validated Supabase user session.
- Row-level security isolates launch, asset, and run records.
- Storage paths include unguessable identifiers and are private by default.
- Signed upload URLs are short-lived and scoped to one object.
- Asset count, size, MIME type, path, and ownership are validated server-side.
- Prompts and asset contents are excluded from routine logs.
- Prompt-injection resistance is stated in agent instructions and covered by behavioral tests.
- Environment example files contain names and placeholders only.

## 13. Observability

Agents SDK tracing is enabled when supported by the selected current SDK version. Launch Desk adds structured logs for:

- Run ID and trace ID
- Authenticated user or guest-session identifier
- Launch identifier
- Selected model
- Tool start, progress, completion, duration, and error category
- Stream start, first-delta latency, completion, and cancellation
- Token or usage summaries made available by the SDK
- Final run state

Tracing can be disabled through configuration. Logs do not include API keys, tokens, raw uploads, full prompts, or raw model output.

## 14. Testing Strategy

### 14.1 Unit Tests

- Contract acceptance and rejection cases
- Readiness rubric calculation
- Task normalization and dependency preservation
- Owner grouping and duplicate removal
- Channel-copy constraints
- Event sequence and serialization
- Storage path and MIME validation

### 14.2 Component Tests

- Form validation and date handling
- Upload state and rejection messaging
- Progress rail updates
- Incremental text rendering
- Result tab population
- Follow-up submission
- Cancellation and partial-error presentation

### 14.3 API Integration Tests

Mocked SDK runs verify:

- Ordered events with monotonically increasing sequence numbers
- Guaranteed readiness progress
- Model text forwarding
- Tool success and failure
- Cancellation propagation
- Partial stream errors
- Final schema validation and persistence boundaries

### 14.4 Browser Tests

Local guest mode verifies the complete Mission Control path with fixture assets: fill the form, attach a supported file, begin a run, observe progress, and inspect plan, risks, owners, copy, and follow-up content.

### 14.5 Mandatory Live Verification

A dedicated live script starts or targets the local full-stack Next.js development server with the existing `.env.local` key available to the server process. It posts a realistic launch request to the local agent route and reads the response incrementally until completion.

Success requires all of the following:

- At least one `tool.progress` event
- At least one nonempty `text.delta` event produced through a real OpenAI call
- A successful terminal event
- A final result that passes the shared schema

Health checks, server startup, type checking, unit tests, mocked integration tests, and frontend rendering do not substitute for this live check. If sandboxed execution cannot reach the OpenAI API, the server is rerun in an authorized network-capable execution mode. Any remaining blocker is reported by exact category and observed failure.

## 15. Documentation

The README will include:

- Product overview and screenshots or interface summary
- Architecture and directory map
- Prerequisites
- `OPENAI_API_KEY` and Supabase environment-variable setup
- Safe `.env.example`
- Local guest-mode instructions
- Development, test, build, and live-verification commands
- Supabase schema, storage, and migration setup
- Tool and agent extension examples
- Tracing and privacy guidance
- Validation checklist for agent behavior, frontend flow, uploads, tool outputs, security, and live streaming

## 16. Implementation Constraints

- Current OpenAI documentation must be checked before package, model, streaming, tracing, and file-input APIs are selected.
- The model default must come from current official model guidance and remain overrideable through `OPENAI_MODEL`.
- The implementation uses the official Agents SDK package and current Responses API path.
- Dependencies are pinned through the package lockfile.
- The Next.js API route explicitly uses the Node runtime.
- `.superpowers/` is ignored by Git and is not published with the application.
- No secret value is printed, committed, logged, or returned to the browser.

## 17. Acceptance Criteria

Launch Desk is complete when:

1. The polished Mission Control frontend works responsively.
2. Production auth and Supabase persistence are configured with row-level policies.
3. Local guest mode supports repeatable development and tests.
4. Supported assets upload and appear in authorized runs.
5. The agent uses the approved tools and returns the complete structured result.
6. Progressive tool and text events render in the frontend.
7. Tracing or equivalent observability hooks are active and documented.
8. Unit, component, API integration, and browser tests pass.
9. The mandatory real streamed OpenAI check receives both a tool-progress event and a model-text delta.
10. The README and validation checklist enable another developer to run, test, and extend the project.
