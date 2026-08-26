import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { IssueDraft, IssuePreview } from "./types.js";

const processSecret = process.env.APPROVAL_SIGNING_SECRET ?? randomBytes(32).toString("hex");

function canonicalDrafts(drafts: IssueDraft[]): string {
  return JSON.stringify(
    [...drafts]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, recommendationId, provider, destination, title, description }) => ({
        id,
        recommendationId,
        provider,
        destination,
        title,
        description,
      })),
  );
}

function contentHash(drafts: IssueDraft[]): string {
  return createHash("sha256").update(canonicalDrafts(drafts)).digest("hex");
}

function signature(value: string): string {
  return createHmac("sha256", processSecret).update(value).digest("base64url");
}

export function createIssuePreview(input: {
  reviewId: string;
  ownerSubject: string;
  drafts: IssueDraft[];
  lifetimeMinutes?: number;
}): { preview: IssuePreview; approvalToken: string } {
  const preview: IssuePreview = {
    id: randomUUID(),
    reviewId: input.reviewId,
    ownerSubject: input.ownerSubject,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (input.lifetimeMinutes ?? 15) * 60_000).toISOString(),
    contentHash: contentHash(input.drafts),
    drafts: input.drafts,
  };
  const payload = Buffer.from(
    JSON.stringify({
      previewId: preview.id,
      ownerSubject: preview.ownerSubject,
      contentHash: preview.contentHash,
      expiresAt: preview.expiresAt,
    }),
  ).toString("base64url");
  return { preview, approvalToken: `${payload}.${signature(payload)}` };
}

export function verifyIssueApproval(input: {
  preview: IssuePreview;
  ownerSubject: string;
  approvalToken: string;
}): void {
  const [payload, suppliedSignature, extra] = input.approvalToken.split(".");
  if (!payload || !suppliedSignature || extra) throw new Error("Approval token is malformed.");
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("Approval token signature is invalid.");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    previewId: string;
    ownerSubject: string;
    contentHash: string;
    expiresAt: string;
  };
  if (claims.previewId !== input.preview.id || claims.ownerSubject !== input.ownerSubject) {
    throw new Error("Approval token does not belong to this preview or user.");
  }
  if (claims.expiresAt !== input.preview.expiresAt) throw new Error("Issue preview expiry changed after approval.");
  if (claims.contentHash !== input.preview.contentHash || contentHash(input.preview.drafts) !== input.preview.contentHash) {
    throw new Error("Issue preview changed after approval.");
  }
  if (Date.parse(claims.expiresAt) <= Date.now()) throw new Error("Approval token has expired.");
}
