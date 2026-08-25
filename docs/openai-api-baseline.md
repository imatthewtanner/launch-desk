# OpenAI API baseline

Verified on **2026-08-25** against the official OpenAI developer documentation.

## Package baseline

| Package | Installed version | Role |
| --- | ---: | --- |
| `@openai/agents` | `0.17.0` | Agent, tools, runner, streaming, and tracing |
| `openai` | `7.5.0` | OpenAI platform client and file inputs |
| `zod` | `4.4.3` | Runtime input/output contracts |

## Implementation decisions

- Use the TypeScript [Agents SDK](https://developers.openai.com/api/docs/guides/agents) with `Agent`, `run`, and `tool`, following the [current quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart).
- Use one primary launch-planning agent with deterministic tools. New handoffs can be added later without changing the API contract.
- Default to `gpt-5.6-terra`, the balanced GPT-5.6 model for professional workloads. Allow an `OPENAI_MODEL` override; use `gpt-5.6-sol` when maximum reasoning quality matters or `gpt-5.6-luna` for cost-sensitive workloads. See the [models guide](https://developers.openai.com/api/docs/models).
- Request `stream: true`, forward `raw_model_stream_event` / `output_text_delta` text deltas, surface tool lifecycle progress from run-item events, await `stream.completed`, and retain `stream.finalOutput`, following [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents).
- Wrap each launch-plan run in `withTrace` and attach non-secret workflow metadata. The SDK enables server-side tracing by default; see [Observability integrations](https://developers.openai.com/api/docs/guides/agents/integrations-observability).
- Map extracted text to `input_text`, PDFs to `input_file`, and supported images to `input_image`. Use Base64 only for bounded local uploads; see [File inputs](https://developers.openai.com/api/docs/guides/file-inputs) and [Images and vision](https://developers.openai.com/api/docs/guides/images-vision).
- Do not use the Assistants API, legacy Chat Completions scaffolding, or a compatibility shim.

## Stream contract target

The application API emits newline-delimited JSON. Its public event contract distinguishes:

1. `run.started`
2. `tool.started` and `tool.completed`
3. `text.delta`
4. `run.completed` with the validated final launch-plan payload
5. `error` with a stable category, retryability flag, and safe diagnostic

The live verification script must observe at least one tool event and one non-empty model text delta through the local `/api/agent` route.
