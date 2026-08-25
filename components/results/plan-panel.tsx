import { Check, UserRound, AlertTriangle } from 'lucide-react';

import type { LaunchResult } from '@/lib/contracts/launch';

export function PlanPanel({ result }: { result: LaunchResult }) {
  return (
    <div className="plan-panel">
      {result.readiness.blockers[0] ? (
        <div className="blocker-notice" role="note">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>
            <strong>Blocker:</strong> {result.readiness.blockers[0]}
          </span>
        </div>
      ) : null}

      {result.prioritizedPlan.length === 0 ? (
        <p className="empty-panel-copy">No plan phases were returned.</p>
      ) : (
        <ol className="plan-timeline">
          {result.prioritizedPlan.map((phase, phaseIndex) => (
            <li key={`${phase.name}-${phaseIndex}`}>
              <div className="timeline-marker" aria-hidden="true">
                {phaseIndex + 1}
              </div>
              <section>
                <header className="phase-header">
                  <div>
                    <h3>{phase.name}</h3>
                    <p>{phase.objective}</p>
                  </div>
                </header>
                <ul className="phase-task-list">
                  {phase.tasks.map((task) => (
                    <li key={task.id}>
                      <div className="task-title-row">
                        <span className={`priority priority-${task.priority.toLowerCase()}`}>
                          {task.priority}
                        </span>
                        <h4>{task.title}</h4>
                      </div>
                      <p>{task.description}</p>
                      <div className="task-meta">
                        <span>
                          <UserRound aria-hidden="true" size={14} /> {task.ownerRole}
                        </span>
                        <span>{task.timing}</span>
                      </div>
                      {task.acceptanceCriteria.length > 0 ? (
                        <div className="acceptance-block">
                          <strong>Acceptance criteria</strong>
                          <ul>
                            {task.acceptanceCriteria.map((criterion) => (
                              <li key={criterion}>
                                <Check aria-hidden="true" size={14} /> {criterion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
