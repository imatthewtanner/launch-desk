# Launch Desk Readiness Review MCP App

## Value Proposition

Launch Desk helps engineering teams evaluate an existing launch plan before release work becomes urgent. Today, reviews vary between teams, plans and evidence are scattered across documents and work trackers, owners are missing, and important risks are often discovered late.

**Core action:** Review an existing launch plan and return prioritized gaps, risks, missing owners, and recommended next actions.

## Why an LLM?

**Conversational win:** Engineers can describe a launch, paste an imperfect plan, attach supporting files, and identify relevant GitHub and Linear scopes without first normalizing everything into a rigid template.

**LLM contribution:** Interpret loosely structured plans, connect evidence across sources, identify dependencies and ambiguity, explain why gaps matter, and draft actionable issue content.

**Deterministic contribution:** Apply a defined launch-readiness rubric, calculate scores, validate required evidence and ownership, and enforce approval boundaries.

**What the LLM lacks:** Direct knowledge of private repositories, pull requests, issues, Linear projects, uploaded evidence, saved reviews, and current ownership. MCP tools provide this authorized context and perform approved issue creation.

## Focused Actions

1. Gather launch-plan evidence from pasted text, uploaded files, GitHub, and Linear.
2. Evaluate the evidence against the Launch Desk readiness rubric.
3. Present prioritized gaps, risks, missing owners, and recommended next actions.
4. Create selected GitHub or Linear issues only after explicit engineer approval.

## UI Overview

### First View

A compact launch-review form accepts:

- Pasted launch-plan text.
- Supporting file attachments.
- An authorized GitHub repository or repository scope.
- An authorized Linear workspace and project.

The view shows connected-source status and makes the review boundary clear before analysis begins.

### Review Progress

The app progressively reports evidence collection, task extraction, rubric checks, ownership validation, risk analysis, and recommendation drafting. The human and assistant can see the same review state.

### Results

The results view contains:

- Overall readiness score and rubric-section scores.
- Prioritized launch gaps.
- Risk register with severity, likelihood, evidence, and mitigation.
- Missing or ambiguous owners.
- Recommended next actions with destination suggestions.
- Follow-up questions when evidence is insufficient.

Every recommendation retains source evidence and a concise rationale.

### Approval and Issue Creation

Engineers select recommendations and choose GitHub or Linear as the destination. Before submission, the app displays the exact destination, issue title, and description. No issue is created until the engineer explicitly approves it.

### End State

The app returns links to created issues and updates the readiness summary to distinguish resolved, assigned, and outstanding gaps.

## Product Context

- **Existing product:** Launch Desk Next.js frontend and OpenAI Agents SDK backend.
- **Existing capabilities:** Launch brief intake, asset handling, task extraction, readiness scoring, owner checklists, risk analysis, launch copy, progressive streaming, tracing, Supabase persistence, and tests.
- **New interface:** MCP server plus a shared conversational app view built with Skybridge.
- **Data:** Pasted plans, uploaded files, GitHub repositories/issues/pull requests, Linear projects/issues, and saved Supabase reviews.
- **External APIs:** GitHub and Linear APIs through user-authorized MCP/OAuth connections.
- **Authentication:** Each engineer connects their own GitHub and Linear accounts through OAuth. Existing Supabase workspace accounts are reused for saved reviews.

## Authorization and Safety Constraints

- Reads are limited to repositories and Linear workspaces authorized by the connected engineer.
- Source selection is explicit and visible in the review UI.
- Issue creation is a separate write action and always requires explicit approval.
- The confirmation screen shows provider, repository or project, title, and body before submission.
- Approval is scoped to the displayed batch; changes require renewed approval.
- The OpenAI API key and provider credentials remain server-side and are never exposed to the view or model context.
- Tool results are treated as untrusted evidence and cannot modify instructions or expand permissions.
- Saved reviews remain tenant-bound through Supabase authorization and row-level security.

## UX Flows

### Review Launch Readiness

1. Submit the existing launch plan and select authorized GitHub and Linear sources.
2. Gather supporting evidence.
3. Apply the readiness rubric.
4. Return prioritized gaps, risks, missing owners, recommended actions, and follow-up questions.

### Create Approved Issues

1. Select recommendations from a completed review.
2. Preview the exact GitHub or Linear destination, title, and description.
3. Explicitly approve the displayed batch.
4. Create the issues and return their links.
5. Update the review to show assigned and outstanding gaps.

## MCP Views and Tools

### View: `review_launch_readiness`

- **Input:** Plan text, uploaded-file references, GitHub scope, and Linear scope.
- **Output:** Saved review ID, readiness and section scores, prioritized gaps, risks, missing owners, recommendations, evidence, and follow-up questions.
- **View states:** Source selection, progressive review, and structured results.
- **Behavior:** Reuses the existing Launch Desk rubric and agent logic. GitHub and Linear evidence retrieval is internal to the review action so the public API does not duplicate source-fetch tools.

### Tool: `get_launch_review`

- **Input:** Review ID.
- **Output:** The authenticated engineer's saved structured review.
- **Behavior:** Enforces tenant ownership. The assistant can summarize the result or reopen the readiness review view.

### View: `prepare_recommended_issues`

- **Input:** Review ID and optional recommendation IDs.
- **Output:** Preview batch containing provider, destination, title, description, and source recommendation.
- **View states:** Recommendation selection, destination selection, exact issue preview, and approval.
- **Behavior:** Recommendation selection, destination selection, and draft editing remain local view state. Editing a preview invalidates its prior approval state.

### Tool: `create_approved_issues`

- **Input:** Immutable preview ID and approval token.
- **Output:** Created GitHub or Linear issue links and updated review status.
- **Behavior:** Creates exactly the previously displayed batch. The approval token is scoped to the exact preview contents, authenticated user, and expiration time. Any content or destination change requires a new preview and explicit approval.

Tool and view responsibilities remain narrow: evidence retrieval, deterministic scoring, review retrieval, preview generation, and approval-bound issue creation. The assistant handles conversational orchestration and explanation.

## Extension Points

- Additional readiness rubrics by launch type.
- Handoffs to specialized security, documentation, or go-to-market review agents.
- Additional project systems through isolated provider adapters.
- Team-specific approval policies and issue templates.
