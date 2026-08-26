import assert from "node:assert/strict";
import test from "node:test";

import { buildLaunchReview } from "./readiness.js";

test("scores explicit launch evidence and prioritizes blocking gaps", () => {
  const review = buildLaunchReview({
    ownerSubject: "user-1",
    title: "API launch",
    planText: [
      "Objective: release the new API to enterprise customers.",
      "Audience: enterprise developers.",
      "Launch date: 2026-09-15.",
      "Owner: Product lead",
    ].join("\n"),
    evidence: [],
    sources: [],
  });

  assert.equal(review.readiness.total, 35);
  assert.ok(review.gaps.some((gap) => gap.category === "rollout" && gap.priority === "P0"));
  assert.ok(review.missingOwners.includes("Engineering lead"));
  assert.ok(review.followUpQuestions.length > 0);
});

test("uses authorized source summaries as rubric evidence", () => {
  const review = buildLaunchReview({
    ownerSubject: "user-1",
    planText: "Objective: launch the service to customers.",
    evidence: [{ provider: "github", reference: "https://github.com/acme/app/issues/1", summary: "Add rollback kill switch" }],
    sources: [{ provider: "github", scope: "acme/app", status: "connected", message: "ok", evidenceCount: 1 }],
  });
  assert.equal(review.readiness.categories.find((item) => item.key === "rollback")?.score, 5);
});
