'use client';

import { useId, useRef, useState } from 'react';

import { CopyPanel } from '@/components/results/copy-panel';
import { FollowUpPanel } from '@/components/results/follow-up-panel';
import { OwnerPanel } from '@/components/results/owner-panel';
import { PlanPanel } from '@/components/results/plan-panel';
import { RiskPanel } from '@/components/results/risk-panel';
import type { LaunchResult } from '@/lib/contracts/launch';

const tabs = [
  { id: 'plan', label: 'Plan' },
  { id: 'risks', label: 'Risks' },
  { id: 'owners', label: 'Owners' },
  { id: 'copy', label: 'Copy' },
  { id: 'questions', label: 'Questions' },
] as const;

type TabId = (typeof tabs)[number]['id'];

interface ResultTabsProps {
  result: LaunchResult;
  onRefine?(answers: Record<string, string>): void;
}

export function ResultTabs({ result, onRefine }: ResultTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('plan');
  const prefix = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectByIndex(index: number) {
    const normalized = (index + tabs.length) % tabs.length;
    setActiveTab(tabs[normalized].id);
    tabRefs.current[normalized]?.focus();
  }

  return (
    <div className="result-tabs">
      <div className="tab-list" role="tablist" aria-label="Launch plan sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`${prefix}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${prefix}-${tab.id}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                selectByIndex(index + 1);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                selectByIndex(index - 1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                selectByIndex(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                selectByIndex(tabs.length - 1);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`${prefix}-${activeTab}-panel`}
        className="tab-panel"
        role="tabpanel"
        aria-labelledby={`${prefix}-${activeTab}-tab`}
        tabIndex={0}
      >
        {activeTab === 'plan' ? <PlanPanel result={result} /> : null}
        {activeTab === 'risks' ? <RiskPanel result={result} /> : null}
        {activeTab === 'owners' ? <OwnerPanel result={result} /> : null}
        {activeTab === 'copy' ? <CopyPanel result={result} /> : null}
        {activeTab === 'questions' ? (
          <FollowUpPanel result={result} onRefine={onRefine} />
        ) : null}
      </div>
    </div>
  );
}
