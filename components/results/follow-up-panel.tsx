'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import type { LaunchResult } from '@/lib/contracts/launch';

interface FollowUpPanelProps {
  result: LaunchResult;
  onRefine?(answers: Record<string, string>): void;
}

export function FollowUpPanel({ result, onRefine }: FollowUpPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (result.followUpQuestions.length === 0) {
    return <p className="empty-panel-copy">No material follow-up questions remain.</p>;
  }

  return (
    <div className="question-list">
      {result.followUpQuestions.map((question, index) => (
        <article key={question.id} className="question-row">
          <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3>{question.question}</h3>
            <p>{question.rationale}</p>
            <label htmlFor={`answer-${question.id}`}>
              Answer: {question.question}
            </label>
            <div className="answer-row">
              <input
                id={`answer-${question.id}`}
                value={answers[question.id] ?? ''}
                placeholder="Add the missing detail"
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="secondary-button"
                disabled={!answers[question.id]?.trim()}
                onClick={() => onRefine?.(answers)}
              >
                Use answer <ArrowRight aria-hidden="true" size={15} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
