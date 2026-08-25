import type { LaunchResult, RiskLevel } from '@/lib/contracts/launch';

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function RiskLevelLabel({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-level risk-${level}`} data-level={level}>
      {titleCase(level)}
    </span>
  );
}

export function RiskPanel({ result }: { result: LaunchResult }) {
  if (result.riskRegister.length === 0) {
    return <p className="empty-panel-copy">No material risks were returned.</p>;
  }

  return (
    <div className="risk-list">
      {result.riskRegister.map((risk) => (
        <article key={risk.id} className="risk-row">
          <header>
            <div>
              <RiskLevelLabel level={risk.level} />
              <h3>{risk.title}</h3>
            </div>
            <span className="risk-owner">{risk.ownerRole}</span>
          </header>
          <p>{risk.description}</p>
          <dl>
            <div>
              <dt>Likelihood</dt>
              <dd>{titleCase(risk.likelihood)}</dd>
            </div>
            <div>
              <dt>Impact</dt>
              <dd>{titleCase(risk.impact)}</dd>
            </div>
            <div>
              <dt>Mitigation</dt>
              <dd>{risk.mitigation}</dd>
            </div>
            <div>
              <dt>Trigger</dt>
              <dd>{risk.trigger}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
