# Launch Desk validation checklist

Use this list before promoting a preview deployment.

## Agent behavior

- [ ] A complete brief produces a useful provisional plan without unnecessary questions.
- [ ] Missing owners, rollback criteria, observability, support, or security evidence lowers readiness and creates material follow-up questions.
- [ ] Priorities distinguish launch blockers (`P0`), blocking coordination (`P1`), and optimization (`P2`).
- [ ] Risks include likelihood, impact, mitigation, trigger, and an owner role.
- [ ] Unknown people remain roles; the agent does not invent named owners.
- [ ] Assumptions are explicit, and unverified work is never described as complete.
- [ ] Prompt-injection text inside fields or assets remains untrusted evidence and cannot change the agent role or reveal instructions.
- [ ] A refinement run uses prior results and answers without discarding unaffected work.

## Frontend flow

- [ ] Product brief, audience, launch date, constraints, and assets are keyboard accessible and validated.
- [ ] Invalid MIME types, files over 20 MB, duplicates, and more than 10 files receive clear feedback.
- [ ] Submit states distinguish workspace creation, asset upload, connection, and agent work.
- [ ] Live activity shows at least one tool progress update while planning.
- [ ] Model text appears progressively before the final structured result.
- [ ] Plan, Risks, Owners, Copy, and Questions tabs work with click, Arrow keys, Home, and End.
- [ ] Owner checklist items can be checked without mutating server data.
- [ ] Copy suggestions copy to the clipboard and retain confirmation warnings.
- [ ] A follow-up answer starts a refinement run.
- [ ] Cancelling an active run exposes a cancelled state and preserves partial text.
- [ ] The sign-in dialog submits a Supabase magic link in workspace mode.
- [ ] Desktop and mobile layouts have no clipping, overlap, unreadable text, scroll traps, or framework overlay.
- [ ] The browser console has no relevant warnings or errors.

## Tool outputs

- [ ] `extract_launch_tasks` produces stable IDs, owner roles, dependencies, timing, acceptance criteria, and evidence sources.
- [ ] `check_launch_readiness` never awards credit for missing evidence and returns blockers, warnings, and missing details.
- [ ] `generate_owner_checklists` preserves task priorities and acceptance criteria.
- [ ] `draft_channel_copy` respects channel constraints and identifies claims that need confirmation.
- [ ] Tool failures become safe stream errors without stack traces, secrets, or raw provider responses.

## Persistence and security

- [ ] Guest mode keeps launch and asset data session-scoped and local.
- [ ] Production mode requires Supabase authentication.
- [ ] Row-level security prevents cross-user launch, asset, and run access.
- [ ] Asset storage paths and database rows are owner- and launch-scoped.
- [ ] Completed, partial, failed, and cancelled runs persist the correct status.
- [ ] `OPENAI_API_KEY` and `SUPABASE_SECRET_KEY` are server-only and absent from client bundles and logs.
- [ ] OpenAI traces exclude sensitive inputs while retaining workflow metadata and tool timing.

## Automated gates

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes in desktop and mobile Chromium projects.
- [ ] `npm run verify:live` observes `tool.progress`, a nonempty `text.delta`, and `run.completed` through the real local API route.
- [ ] The deployed preview renders, completes the primary interaction, and reports no runtime error clusters.
