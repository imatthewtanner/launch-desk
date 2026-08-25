import { runLaunchAgent } from '@/lib/agent/run-launch-agent';
import { readServerEnv } from '@/lib/config/env';
import { createPlanHandler } from '@/lib/server/create-plan-handler';
import {
  authorizeRuntimeAssets,
  getRuntimeRepository,
  getRuntimeStorage,
  resolveRuntimeActor,
} from '@/lib/server/runtime';
import { checkLaunchReadiness } from '@/lib/tools/check-launch-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const env = readServerEnv();
  const handler = createPlanHandler({
    model: env.OPENAI_MODEL,
    tracingDisabled: env.OPENAI_TRACING_DISABLED,
    resolveActor: (guest) => resolveRuntimeActor(guest, env),
    getRepository: getRuntimeRepository,
    authorizeAssets: authorizeRuntimeAssets,
    getStorage: (actor) => getRuntimeStorage(actor),
    checkReadiness: checkLaunchReadiness,
    runAgent: runLaunchAgent,
  });

  return handler(request);
}
