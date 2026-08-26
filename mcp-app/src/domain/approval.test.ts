import assert from "node:assert/strict";
import test from "node:test";

import { createIssuePreview, verifyIssueApproval } from "./approval.js";

const draft = {
  id: "draft-1",
  recommendationId: "recommend-rollout",
  provider: "github" as const,
  destination: "acme/app",
  title: "Add rollout evidence",
  description: "Document the canary plan.",
};

test("accepts the signed preview for its owner", () => {
  const { preview, approvalToken } = createIssuePreview({ reviewId: "review-1", ownerSubject: "user-1", drafts: [draft] });
  assert.doesNotThrow(() => verifyIssueApproval({ preview, ownerSubject: "user-1", approvalToken }));
});

test("rejects owner changes and edited issue content", () => {
  const { preview, approvalToken } = createIssuePreview({ reviewId: "review-1", ownerSubject: "user-1", drafts: [draft] });
  assert.throws(() => verifyIssueApproval({ preview, ownerSubject: "user-2", approvalToken }), /does not belong/);
  preview.drafts[0].title = "Changed after approval";
  assert.throws(() => verifyIssueApproval({ preview, ownerSubject: "user-1", approvalToken }), /changed after approval/);
});
