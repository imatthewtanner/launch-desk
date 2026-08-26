import "@/index.css";

import { AlertTriangle, ArrowUpRight, CheckCircle2, Maximize2, Minimize2, ShieldAlert, UserRoundX } from "lucide-react";
import { useDisplayMode, useLayout } from "skybridge/web";

import { useToolInfo } from "../helpers.js";

export default function ReviewLaunchReadiness() {
  const { output, isPending } = useToolInfo<"review_launch_readiness">();
  const [displayMode, setDisplayMode] = useDisplayMode();
  const { theme } = useLayout();
  const fullscreen = displayMode === "fullscreen";

  if (isPending || !output) return <div className={`desk-shell ${theme === "dark" ? "dark" : ""}`}><div className="loading-line" />Reviewing launch evidence…</div>;

  const topGaps = fullscreen ? output.gaps : output.gaps.slice(0, 3);
  const scoreTone = output.readiness.total >= 80 ? "good" : output.readiness.total >= 60 ? "warn" : "danger";

  return (
    <main className={`desk-shell ${theme === "dark" ? "dark" : ""} ${fullscreen ? "fullscreen" : ""}`}>
      <header className="hero">
        <div>
          <p className="eyebrow">Launch Desk · readiness review</p>
          <h1>{output.title}</h1>
          <p className="subtle">Evidence-backed review · {new Date(output.createdAt).toLocaleDateString()}</p>
        </div>
        <div className={`score score-${scoreTone}`} aria-label={`Readiness score ${output.readiness.total} out of 100`}>
          <strong>{output.readiness.total}</strong><span>/100</span>
        </div>
      </header>

      <div className="stat-row" data-llm={`Launch readiness ${output.readiness.total}/100. ${output.gaps.length} gaps, ${output.risks.length} risks, ${output.missingOwners.length} missing owners.`}>
        <span><AlertTriangle size={16} />{output.gaps.length} gaps</span>
        <span><ShieldAlert size={16} />{output.risks.length} risks</span>
        <span><UserRoundX size={16} />{output.missingOwners.length} missing owners</span>
      </div>

      <section>
        <div className="section-heading"><h2>Priority gaps</h2><span>Highest leverage first</span></div>
        <div className="gap-list">
          {topGaps.length ? topGaps.map((gap) => (
            <article className="gap-card" key={gap.id} data-llm={`${gap.priority}: ${gap.title}. ${gap.rationale}`}>
              <span className={`priority priority-${gap.priority.toLowerCase()}`}>{gap.priority}</span>
              <div><h3>{gap.title}</h3><p>{gap.rationale}</p></div>
            </article>
          )) : <div className="empty"><CheckCircle2 size={18} />No rubric gaps detected.</div>}
        </div>
      </section>

      {fullscreen && (
        <div className="detail-grid">
          <section>
            <div className="section-heading"><h2>Risk register</h2><span>{output.risks.length} tracked</span></div>
            <div className="stack">
              {output.risks.map((risk) => <article className="detail-card" key={risk.id} data-llm={`Risk ${risk.level}: ${risk.title}. Mitigation: ${risk.mitigation}`}><div className="detail-title"><span className={`risk risk-${risk.level}`}>{risk.level}</span><h3>{risk.title}</h3></div><p>{risk.mitigation}</p><small>Owner: {risk.ownerRole}</small></article>)}
            </div>
          </section>
          <section>
            <div className="section-heading"><h2>Next actions</h2><span>{output.recommendations.length} recommended</span></div>
            <div className="stack">
              {output.recommendations.map((item) => <article className="detail-card" key={item.id} data-llm={`${item.priority} recommendation: ${item.title}. Owner: ${item.ownerRole}`}><div className="detail-title"><span className={`priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span><h3>{item.title}</h3></div><p>{item.description}</p><small>{item.ownerRole} · suggested {item.destinationSuggestion}</small></article>)}
            </div>
          </section>
          <section>
            <div className="section-heading"><h2>Rubric coverage</h2><span>Weighted to 100</span></div>
            <div className="rubric">
              {output.readiness.categories.map((category) => <div key={category.key}><div><span>{category.label}</span><strong>{category.score}/{category.maxScore}</strong></div><progress max={category.maxScore} value={category.score} /></div>)}
            </div>
          </section>
          <section>
            <div className="section-heading"><h2>Questions to resolve</h2><span>Use these in the conversation</span></div>
            <ol className="questions">{output.followUpQuestions.map((question) => <li key={question} data-llm={question}>{question}</li>)}</ol>
          </section>
        </div>
      )}

      <footer className="actions">
        <button className="secondary" onClick={() => setDisplayMode(fullscreen ? "inline" : "fullscreen")}>
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullscreen ? "Collapse" : "View full review"}
        </button>
        <span className="next-hint">Ask Launch Desk to prepare selected actions as issues <ArrowUpRight size={14} /></span>
      </footer>
    </main>
  );
}
