import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.LAUNCH_DESK_BASE_URL ?? 'http://127.0.0.1:3000';
const resultPath = process.env.LAUNCH_DESK_VERIFY_OUTPUT;

async function recordResult(result) {
  if (resultPath) await writeFile(resultPath, `${JSON.stringify(result)}\n`, 'utf8');
}

function futureDate(days = 45) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function responseBody(response) {
  return await response.json().catch(() => ({}));
}

async function createLaunch(launch, guest) {
  const response = await fetch(`${baseUrl}/api/launches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ launch, guest }),
  });
  const body = await responseBody(response);
  if (!response.ok || typeof body.launch?.id !== 'string') {
    throw new Error(
      `Launch creation failed (${response.status}): ${body.error ?? 'invalid response'}`,
    );
  }
  return body.launch.id;
}

async function verifyStream(launchId, launch, guest) {
  const response = await fetch(`${baseUrl}/api/agent/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify({ launchId, launch, guest }),
  });
  if (!response.ok || !response.body) {
    const body = await responseBody(response);
    throw new Error(
      `Agent request failed (${response.status}): ${body.error ?? 'empty response'}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastSequence = 0;
  let sawToolProgress = false;
  let sawTextDelta = false;
  let sawCompletion = false;
  const eventTypes = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (!Number.isInteger(event.sequence) || event.sequence <= lastSequence) {
        throw new Error('Stream sequence numbers were not strictly increasing.');
      }
      lastSequence = event.sequence;
      eventTypes.push(event.type);
      sawToolProgress ||= event.type === 'tool.progress';
      sawTextDelta ||= event.type === 'text.delta' && event.delta.trim().length > 0;
      sawCompletion ||= event.type === 'run.completed';
      if (event.type === 'error') {
        throw new Error(
          `Agent stream error (${event.category ?? 'unknown'}): ${event.message}`,
        );
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) throw new Error('The stream ended with an incomplete event.');
  if (!sawToolProgress) throw new Error('No tool.progress event was received.');
  if (!sawTextDelta) throw new Error('No nonempty text.delta event was received.');
  if (!sawCompletion) throw new Error('No run.completed event was received.');

  return eventTypes;
}

const launch = {
  title: 'Atlas live verification',
  productBrief:
    'Launch Atlas, a shared delivery reporting workspace for engineering managers. It combines release status, delivery risks, and ownership in one view.',
  audience: 'Engineering managers and technical program leads',
  launchDate: futureDate(),
  constraints:
    'Use a staged rollout, avoid downtime, preserve SOC 2 controls, and require a documented rollback path.',
  assets: [],
};
const guest = {
  ownerId: `verify-owner-${randomUUID()}`,
  sessionId: `verify-session-${randomUUID()}`,
  runId: `verify-upload-${randomUUID()}`,
};

try {
  const launchId = await createLaunch(launch, guest);
  const eventTypes = await verifyStream(launchId, launch, guest);
  const counts = Object.fromEntries(
    [...new Set(eventTypes)].map((type) => [
      type,
      eventTypes.filter((candidate) => candidate === type).length,
    ]),
  );
  await recordResult({ ok: true, eventCount: eventTypes.length, counts });
  console.log(
    `Live stream verified: ${eventTypes.length} events; ` +
      `tool.progress=${counts['tool.progress'] ?? 0}, ` +
      `text.delta=${counts['text.delta'] ?? 0}, ` +
      `run.completed=${counts['run.completed'] ?? 0}.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await recordResult({ ok: false, message });
  console.error(message);
  process.exitCode = 1;
}
