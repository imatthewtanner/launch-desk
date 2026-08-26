import "@/index.css";

import { Check, ExternalLink, GitBranch, LoaderCircle, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import { useDisplayMode, useLayout, useOpenExternal } from "skybridge/web";

import { useCallTool, useToolInfo } from "../helpers.js";

export default function PrepareRecommendedIssues() {
  const { output, responseMetadata, isPending } = useToolInfo<"prepare_recommended_issues">();
  const { callTool, data, isPending: isCreating, isSuccess } = useCallTool("create_approved_issues");
  const [displayMode, setDisplayMode] = useDisplayMode();
  const { theme } = useLayout();
  const openExternal = useOpenExternal();
  const fullscreen = displayMode === "fullscreen";

  if (isPending || !output) return <div className={`desk-shell ${theme === "dark" ? "dark" : ""}`}><div className="loading-line" />Preparing exact issue preview…</div>;
  const token = responseMetadata?.approvalToken;
  const createdIssues = data?.structuredContent.createdIssues ?? [];

  return (
    <main className={`desk-shell ${theme === "dark" ? "dark" : ""} ${fullscreen ? "fullscreen" : ""}`}>
      <header className="hero compact">
        <div><p className="eyebrow">Launch Desk · approval gate</p><h1>{isSuccess ? "Issues created" : "Review exact issue changes"}</h1><p className="subtle">Preview expires {new Date(output.preview.expiresAt).toLocaleString()}</p></div>
        <div className="approval-mark"><ShieldCheck size={22} /><span>{output.preview.drafts.length} issue{output.preview.drafts.length === 1 ? "" : "s"}</span></div>
      </header>

      {isSuccess ? (
        <section className="success-panel" data-llm={`${createdIssues.length} approved issues were created.`}>
          <Check size={24} /><div><h2>Approved work is assigned</h2><p>The signed preview was processed once. Repeating this action will not create duplicates.</p></div>
          <div className="created-links">{createdIssues.map((issue) => <button key={issue.url} className="link-button" onClick={() => openExternal(issue.url, { redirectUrl: false })}>{issue.title}<ExternalLink size={14} /></button>)}</div>
        </section>
      ) : (
        <>
          <div className="notice" data-llm={`Approval required for ${output.preview.drafts.length} exact issue drafts. No issues have been created.`}><ShieldCheck size={17} /><span>No write has happened. Approval creates exactly the drafts shown below; edits require a new preview.</span></div>
          <section className="issue-list">
            {output.preview.drafts.map((draft) => (
              <article className="issue-card" key={draft.id} data-llm={`${draft.provider} issue for ${draft.destination}: ${draft.title}`}>
                <div className="issue-meta"><span><GitBranch size={14} />{draft.provider}</span><code>{draft.destination}</code></div>
                <h2>{draft.title}</h2>
                <pre>{fullscreen ? draft.description : `${draft.description.slice(0, 280)}${draft.description.length > 280 ? "…" : ""}`}</pre>
              </article>
            ))}
          </section>
        </>
      )}

      <footer className="actions">
        <button className="secondary" onClick={() => setDisplayMode(fullscreen ? "inline" : "fullscreen")}>
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullscreen ? "Collapse" : "Inspect full drafts"}
        </button>
        {!isSuccess && <button className="primary" disabled={isCreating || !token} onClick={() => token && callTool({ previewId: output.preview.id, approvalToken: token })}>{isCreating ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{isCreating ? "Creating…" : `Approve & create ${output.preview.drafts.length}`}</button>}
      </footer>
    </main>
  );
}
