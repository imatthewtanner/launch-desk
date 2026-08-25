'use client';

import { Check, Circle, LoaderCircle, Square } from 'lucide-react';

import type { FollowUpQuestion } from '@/lib/contracts/launch';
import type {
  LaunchUiStatus,
  ToolActivity,
} from '@/hooks/use-launch-stream';

interface ProgressRailProps {
  activity: ToolActivity[];
  status: LaunchUiStatus;
  followUps: FollowUpQuestion[];
  onCancel?(): void;
}

function isActive(status: LaunchUiStatus): boolean {
  return status === 'connecting' || status === 'streaming';
}

export function ProgressRail({
  activity,
  status,
  followUps,
  onCancel,
}: ProgressRailProps) {
  const active = isActive(status);

  return (
    <aside className="activity-rail" aria-labelledby="activity-title">
      <div className="activity-heading-row">
        <h2 id="activity-title">Live activity</h2>
        {active && onCancel ? (
          <button type="button" className="cancel-button" onClick={onCancel}>
            <Square aria-hidden="true" size={12} fill="currentColor" />
            Cancel run
          </button>
        ) : null}
      </div>

      <div className="activity-live" aria-live="polite" aria-atomic="false">
        {activity.length === 0 ? (
          <div className="activity-empty">
            <Circle aria-hidden="true" size={18} />
            <p>
              {status === 'idle'
                ? 'Agent steps will appear here as the plan is built.'
                : 'Connecting to the planning agent…'}
            </p>
          </div>
        ) : (
          <ol className="activity-list">
            {activity.map((item, index) => (
              <li key={item.id} className={`activity-step is-${item.status}`}>
                <div className="activity-marker" aria-hidden="true">
                  {item.status === 'completed' ? (
                    <Check size={15} strokeWidth={2.2} />
                  ) : (
                    <LoaderCircle className="spin" size={16} />
                  )}
                </div>
                <div>
                  <span className="activity-index">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{item.message}</h3>
                  <p className="activity-status">
                    {item.status === 'completed' ? 'Completed' : 'In progress'}
                    {item.durationMs !== undefined ? <small>{item.durationMs} ms</small> : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="follow-up-rail">
        <h3>
          {followUps.length} follow-up question{followUps.length === 1 ? '' : 's'}
        </h3>
        {followUps.length > 0 ? (
          <ul>
            {followUps.slice(0, 3).map((question) => (
              <li key={question.id}>{question.question}</li>
            ))}
          </ul>
        ) : (
          <p>Material gaps will be collected here.</p>
        )}
      </div>
    </aside>
  );
}
