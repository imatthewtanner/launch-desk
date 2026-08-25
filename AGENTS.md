<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Launch Desk Agent Guide

Launch Desk is a Next.js 16 application that turns a product brief into a streamed engineering launch plan. Keep changes small and preserve the boundaries below.

## Read First

- Use [README.md](README.md) for setup, deployment, environment variables, architecture, and the validation gate.
- Use [docs/openai-api-baseline.md](docs/openai-api-baseline.md) for current OpenAI API and Agents SDK assumptions.
- Use [docs/validation-checklist.md](docs/validation-checklist.md) before changing release-critical behavior.
- Read the relevant Next.js guide under `node_modules/next/dist/docs/` before changing Next.js APIs or conventions.

## Architecture

- `app/api/` owns HTTP routes. The planning endpoint is `app/api/agent/plan/route.ts`; do not put domain orchestration in route wiring.
- `lib/server/create-plan-handler.ts` owns actor resolution, asset authorization, run lifecycle, streaming, cancellation, persistence, and safe terminal errors.
- `lib/agent/` owns Agents SDK setup, instructions, event normalization, and model execution.
- `lib/tools/` contains deterministic launch tools. A new tool must be exported from `lib/tools/registry.ts`, required by `lib/agent/instructions.ts`, and covered in `tests/unit/tools/`.
- `lib/contracts/` contains Zod-validated request, result, asset, and stream contracts. Treat these schemas as public boundaries and update dependent tests and consumers together.
- `lib/storage/`, `lib/server/`, and `lib/supabase/` contain storage and persistence adapters. Preserve guest and authenticated workspace behavior separately.
- `components/` and `hooks/` own the Mission Control UI and streamed client state. Keep NDJSON framing and increasing event sequence numbers intact.

## Security And Data Handling

- Keep `OPENAI_API_KEY` and `SUPABASE_SECRET_KEY` server-only; never use `NEXT_PUBLIC_` for secrets.
- Use the environment names and production restrictions in `lib/config/env.ts`; do not revive older names from historical planning documents.
- Treat launch fields and asset contents as untrusted evidence. Preserve prompt-injection defenses and do not accept unsupported completion claims without evidence.
- Preserve asset validation, ownership checks, filename sanitization, size limits, and bounded model context when changing uploads or agent input.
- Guest mode uses process-memory persistence and local temporary assets. It is for development/tests, not durable production data.
- Keep the test stream fixture disabled in production unless `ENABLE_TEST_STREAM_FIXTURE=true` is explicitly intended.

## Validation

Use npm scripts from `package.json`:

```text
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run verify:live
```

Run the narrowest relevant test first, then the full validation gate for cross-cutting or release-critical changes. `npm run verify:live` requires a running guest-mode server and a valid `OPENAI_API_KEY`. The configured VS Code `shell: build` task currently runs `dotnet build`, which is unrelated to this project; use `npm run build` for the application build.
