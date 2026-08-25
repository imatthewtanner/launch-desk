'use client';

import { useState } from 'react';

import type { LaunchResult } from '@/lib/contracts/launch';

export function OwnerPanel({ result }: { result: LaunchResult }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  if (result.ownerChecklists.length === 0) {
    return <p className="empty-panel-copy">No owner checklists were returned.</p>;
  }

  return (
    <div className="owner-groups">
      {result.ownerChecklists.map((checklist) => (
        <section key={checklist.ownerRole} className="owner-group">
          <header>
            <h3>{checklist.ownerRole}</h3>
            <span>{checklist.items.length} items</span>
          </header>
          <ul>
            {checklist.items.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <li key={item.id} className={isChecked ? 'is-checked' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setChecked((current) => {
                          const next = new Set(current);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>
                        {item.priority} · {item.dueGuidance}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
