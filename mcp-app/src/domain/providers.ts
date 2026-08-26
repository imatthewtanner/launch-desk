import type { CreatedIssue, IssueDraft, SourceEvidence, SourceStatus } from "./types.js";

const githubHeaders = () => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function collectGithubEvidence(repository?: string): Promise<{
  evidence: SourceEvidence[];
  status?: SourceStatus;
}> {
  if (!repository) return { evidence: [] };
  if (!process.env.GITHUB_TOKEN) {
    return {
      evidence: [],
      status: {
        provider: "github",
        scope: repository,
        status: "not_configured",
        message: "GitHub is selected, but no authorized provider credential is available.",
        evidenceCount: 0,
      },
    };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeRepository(repository)}/issues?state=open&per_page=20`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const items = (await response.json()) as Array<{
      html_url: string;
      title: string;
      body?: string | null;
      pull_request?: unknown;
    }>;
    const evidence = items.map((item) => ({
      provider: "github" as const,
      reference: item.html_url,
      summary: `${item.pull_request ? "Pull request" : "Issue"}: ${item.title}${item.body ? ` — ${item.body.slice(0, 300)}` : ""}`,
    }));
    return {
      evidence,
      status: {
        provider: "github",
        scope: repository,
        status: "connected",
        message: `Reviewed ${evidence.length} open GitHub items.`,
        evidenceCount: evidence.length,
      },
    };
  } catch (error) {
    return {
      evidence: [],
      status: {
        provider: "github",
        scope: repository,
        status: "error",
        message: error instanceof Error ? error.message : "GitHub evidence retrieval failed.",
        evidenceCount: 0,
      },
    };
  }
}

export async function collectLinearEvidence(projectId?: string): Promise<{
  evidence: SourceEvidence[];
  status?: SourceStatus;
}> {
  if (!projectId) return { evidence: [] };
  if (!process.env.LINEAR_API_KEY) {
    return {
      evidence: [],
      status: {
        provider: "linear",
        scope: projectId,
        status: "not_configured",
        message: "Linear is selected, but no authorized provider credential is available.",
        evidenceCount: 0,
      },
    };
  }

  try {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: process.env.LINEAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query ProjectIssues($id: String!) { project(id: $id) { issues(first: 20) { nodes { identifier title description url } } } }`,
        variables: { id: projectId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Linear returned ${response.status}`);
    const payload = (await response.json()) as {
      data?: { project?: { issues?: { nodes?: Array<{ identifier: string; title: string; description?: string | null; url: string }> } } };
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length) throw new Error(payload.errors[0].message);
    const nodes = payload.data?.project?.issues?.nodes ?? [];
    const evidence = nodes.map((item) => ({
      provider: "linear" as const,
      reference: item.url,
      summary: `${item.identifier}: ${item.title}${item.description ? ` — ${item.description.slice(0, 300)}` : ""}`,
    }));
    return {
      evidence,
      status: {
        provider: "linear",
        scope: projectId,
        status: "connected",
        message: `Reviewed ${evidence.length} Linear issues.`,
        evidenceCount: evidence.length,
      },
    };
  } catch (error) {
    return {
      evidence: [],
      status: {
        provider: "linear",
        scope: projectId,
        status: "error",
        message: error instanceof Error ? error.message : "Linear evidence retrieval failed.",
        evidenceCount: 0,
      },
    };
  }
}

function encodeRepository(repository: string): string {
  const [owner, name, extra] = repository.split("/");
  if (!owner || !name || extra) throw new Error("GitHub destination must use owner/repository.");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

async function createGithubIssue(draft: IssueDraft): Promise<CreatedIssue> {
  if (!process.env.GITHUB_TOKEN) throw new Error("GitHub issue creation is not configured.");
  const response = await fetch(`https://api.github.com/repos/${encodeRepository(draft.destination)}/issues`, {
    method: "POST",
    headers: githubHeaders(),
    body: JSON.stringify({ title: draft.title, body: draft.description }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub issue creation returned ${response.status}`);
  const issue = (await response.json()) as { html_url: string };
  return { ...draft, url: issue.html_url };
}

async function createLinearIssue(draft: IssueDraft): Promise<CreatedIssue> {
  if (!process.env.LINEAR_API_KEY) throw new Error("Linear issue creation is not configured.");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: process.env.LINEAR_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { url } } }`,
      variables: { input: { teamId: draft.destination, title: draft.title, description: draft.description } },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Linear issue creation returned ${response.status}`);
  const payload = (await response.json()) as {
    data?: { issueCreate?: { success?: boolean; issue?: { url?: string } } };
    errors?: Array<{ message: string }>;
  };
  const url = payload.data?.issueCreate?.issue?.url;
  if (!payload.data?.issueCreate?.success || !url) {
    throw new Error(payload.errors?.[0]?.message ?? "Linear issue creation failed.");
  }
  return { ...draft, url };
}

export async function createProviderIssue(draft: IssueDraft): Promise<CreatedIssue> {
  return draft.provider === "github" ? createGithubIssue(draft) : createLinearIssue(draft);
}
