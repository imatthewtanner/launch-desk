# Launch Desk MCP App

Launch Desk is an engineering launch-readiness evaluator for MCP-compatible assistants. It turns a launch plan plus authorized GitHub, Linear, and file evidence into a weighted score, prioritized gaps, risks, missing owners, and recommended next actions. Selected actions can be previewed and created as issues only after explicit approval in the app UI.

## Tools and views

| Tool | Effect | View |
|---|---|---|
| `review_launch_readiness` | Reads submitted and authorized evidence, evaluates the rubric, saves a review | `review-launch-readiness` |
| `get_launch_review` | Reads one owner-scoped saved review | `review-launch-readiness` |
| `prepare_recommended_issues` | Saves an immutable 15-minute issue preview; performs no provider write | `prepare-recommended-issues` |
| `create_approved_issues` | Creates exactly the signed preview after a user click; replays saved results after successful consumption | Called only by the approval view |

The write tool is app-visible rather than model-visible. The approval token is returned in tool response metadata, not model context. It binds the user, preview, exact draft content, and expiry with HMAC-SHA256. Editing a draft requires a new preview.

## Local setup (npm)

Requires Node.js 24.18+.

```bash
cd mcp-app
npm install
cp .env.example .env
npm run dev
```

The MCP endpoint is `http://localhost:3000/mcp`; DevTools is `http://localhost:3000/`. Use `npm run dev:tunnel` when a remote host needs to reach the local app.

Environment variables:

```dotenv
# Optional evidence and issue providers. Keep server-side only.
GITHUB_TOKEN=
LINEAR_API_KEY=

# Required for stable approvals across replicas/restarts in production.
APPROVAL_SIGNING_SECRET=

# Optional durable storage; otherwise local development uses process memory.
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=

# Optional OAuth/JWT verification. Configure all three for production identity.
MCP_AUTH_ISSUER=
MCP_AUTH_AUDIENCE=
SERVER_URL=https://your-mcp-host.example
```

Static GitHub and Linear tokens are a single-user/local-development adapter. For a multi-user deployment, replace the credential lookup in `src/domain/providers.ts` with your provider OAuth/token-vault adapter. Do not deploy shared broad-scope tokens. When `SERVER_URL` is set, tools reject anonymous calls unless verified OAuth is configured; `MCP_ALLOW_ANONYMOUS_LOCAL=true` is an explicit local-only escape hatch.

`OPENAI_API_KEY` remains required by the main Launch Desk Agents SDK web app. This MCP server does not call a model itself—the connected MCP host does—so it never forwards or exposes that key.

Apply `../supabase/migrations/202608260001_mcp_launch_reviews.sql` for durable reviews and previews. The tables are server-only; anon and authenticated PostgREST roles have no grants. The server always filters by the verified subject before returning data.

## Commands

```bash
npm run typecheck
npm test
npm run build
npm run smoke
npm start
```

## Extension points

- Add rubric categories in `src/domain/readiness.ts`; keep weights totaling 100.
- Add provider adapters in `src/domain/providers.ts`; return normalized source evidence and created issue URLs.
- Add one view file per `view.component` in `src/views/`.
- Keep detailed display-only data in response `_meta`, concise decision data in `structuredContent`, and a short narration in `content`.
- Never add provider tokens, signing secrets, or untrusted HTML to a view response.

## Validation checklist

- [ ] A sparse plan returns P0 rollout/rollback gaps and follow-up questions.
- [ ] Authorized provider failures appear as source status; they do not fabricate evidence.
- [ ] Saved reviews cannot be read under a different subject.
- [ ] Preparing issues performs no GitHub or Linear write.
- [ ] The preview shows exact provider, destination, title, and body.
- [ ] Changed, expired, malformed, or wrong-user approval tokens are rejected.
- [ ] One explicit approval click creates only the previewed issues.
- [ ] A retry after successful consumption returns saved results without duplicate provider writes.
- [ ] Inline views have no more than two CTAs and fullscreen is user-triggered.
- [ ] Both views expose concise `data-llm` narration.
- [ ] Type check, tests, production build, and MCP `initialize`/`tools/list` smoke tests pass.

Built with current MCP Apps conventions and Skybridge; it does not use the Assistants API or legacy Chat Completions.
