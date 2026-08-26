import type { IssuePreview, LaunchReview } from "./types.js";

export interface ReviewStore {
  saveReview(review: LaunchReview): Promise<void>;
  getReview(reviewId: string, ownerSubject: string): Promise<LaunchReview | null>;
  savePreview(preview: IssuePreview): Promise<void>;
  getPreview(previewId: string, ownerSubject: string): Promise<IssuePreview | null>;
}

export class InMemoryReviewStore implements ReviewStore {
  private readonly reviews = new Map<string, LaunchReview>();
  private readonly previews = new Map<string, IssuePreview>();

  async saveReview(review: LaunchReview): Promise<void> {
    this.reviews.set(review.id, structuredClone(review));
  }

  async getReview(reviewId: string, ownerSubject: string): Promise<LaunchReview | null> {
    const review = this.reviews.get(reviewId);
    return review?.ownerSubject === ownerSubject ? structuredClone(review) : null;
  }

  async savePreview(preview: IssuePreview): Promise<void> {
    this.previews.set(preview.id, structuredClone(preview));
  }

  async getPreview(previewId: string, ownerSubject: string): Promise<IssuePreview | null> {
    const preview = this.previews.get(previewId);
    return preview?.ownerSubject === ownerSubject ? structuredClone(preview) : null;
  }
}

class SupabaseReviewStore implements ReviewStore {
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
  ) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase persistence returned ${response.status}: ${await response.text()}`);
    }
    return response;
  }

  async saveReview(review: LaunchReview): Promise<void> {
    await this.request("mcp_launch_reviews?on_conflict=id", {
      method: "POST",
      body: JSON.stringify({ id: review.id, owner_subject: review.ownerSubject, payload: review, updated_at: new Date().toISOString() }),
    });
  }

  async getReview(reviewId: string, ownerSubject: string): Promise<LaunchReview | null> {
    const response = await this.request(
      `mcp_launch_reviews?id=eq.${encodeURIComponent(reviewId)}&owner_subject=eq.${encodeURIComponent(ownerSubject)}&select=payload&limit=1`,
      { method: "GET" },
    );
    const rows = (await response.json()) as Array<{ payload: LaunchReview }>;
    return rows[0]?.payload ?? null;
  }

  async savePreview(preview: IssuePreview): Promise<void> {
    await this.request("mcp_issue_previews?on_conflict=id", {
      method: "POST",
      body: JSON.stringify({
        id: preview.id,
        review_id: preview.reviewId,
        owner_subject: preview.ownerSubject,
        expires_at: preview.expiresAt,
        payload: preview,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  async getPreview(previewId: string, ownerSubject: string): Promise<IssuePreview | null> {
    const response = await this.request(
      `mcp_issue_previews?id=eq.${encodeURIComponent(previewId)}&owner_subject=eq.${encodeURIComponent(ownerSubject)}&select=payload&limit=1`,
      { method: "GET" },
    );
    const rows = (await response.json()) as Array<{ payload: IssuePreview }>;
    return rows[0]?.payload ?? null;
  }
}

export function createReviewStore(): ReviewStore {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  return url && secret ? new SupabaseReviewStore(url.replace(/\/$/, ""), secret) : new InMemoryReviewStore();
}
