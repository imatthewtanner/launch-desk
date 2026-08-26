import { spawn } from "node:child_process";
import { once } from "node:events";

const port = process.env.MCP_SMOKE_PORT ?? "3117";
const endpoint = `http://127.0.0.1:${port}/mcp`;
const server = spawn(process.execPath, ["node_modules/skybridge/bin/run.js", "start"], {
  env: { ...process.env, PORT: port, SKYBRIDGE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (chunk) => { logs += chunk; });
server.stderr.on("data", (chunk) => { logs += chunk; });

function decode(text, contentType) {
  if (contentType.includes("application/json")) return JSON.parse(text);
  const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
  if (!data.length) throw new Error(`No MCP data event in response: ${text}`);
  return JSON.parse(data.at(-1));
}

async function request(body, sessionId) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Connection: "close",
      "Content-Type": "application/json",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP ${response.status}: ${text}`);
  return { payload: text ? decode(text, response.headers.get("content-type") ?? "") : undefined, sessionId: response.headers.get("mcp-session-id") ?? sessionId };
}

async function waitUntilReady() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { headers: { Connection: "close" } });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

try {
  await waitUntilReady();
  const initialized = await request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "launch-desk-smoke", version: "1.0.0" } },
  });
  const sessionId = initialized.sessionId;
  await request({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  const listed = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId);
  const names = listed.payload?.result?.tools?.map((tool) => tool.name) ?? [];
  for (const expected of ["review_launch_readiness", "get_launch_review", "prepare_recommended_issues", "create_approved_issues"]) {
    if (!names.includes(expected)) throw new Error(`Missing tool: ${expected}`);
  }
  const called = await request({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "review_launch_readiness",
      arguments: { title: "Payments API", planText: "Objective: launch the payments API to enterprise customers. Audience: enterprise developers. Launch date: 2026-09-15." },
    },
  }, sessionId);
  const review = called.payload?.result?.structuredContent;
  if (typeof review?.readiness?.total !== "number" || !Array.isArray(review?.gaps) || review.gaps.length === 0) {
    throw new Error(`Unexpected review response: ${JSON.stringify(called.payload)}`);
  }
  const recommendationId = review.recommendations?.[0]?.id;
  const previewed = await request({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "prepare_recommended_issues",
      arguments: { reviewId: review.id, recommendationIds: [recommendationId], destinations: { github: "acme/app", linear: "linear-team-id" } },
    },
  }, sessionId);
  const preview = previewed.payload?.result?.structuredContent?.preview;
  const approvalToken = previewed.payload?.result?._meta?.approvalToken;
  if (preview?.drafts?.length !== 1 || typeof approvalToken !== "string") throw new Error("Issue preview or approval metadata was missing.");
  if (JSON.stringify(previewed.payload?.result?.structuredContent).includes(approvalToken)) throw new Error("Approval token leaked into model-visible structured content.");
  console.log(`MCP smoke passed: ${names.length} tools; readiness ${review.readiness.total}/100; ${review.gaps.length} gaps; signed issue preview ready.`);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 1_000))]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

process.exit(0);
