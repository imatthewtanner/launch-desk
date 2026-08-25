'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import type { CopyChannel, LaunchResult } from '@/lib/contracts/launch';

const channelLabels: Record<CopyChannel, string> = {
  release_notes: 'Release notes',
  email: 'Email',
  in_app: 'In-app',
  social: 'Social',
  internal: 'Internal',
  support: 'Support',
};

export function CopyPanel({ result }: { result: LaunchResult }) {
  const [copied, setCopied] = useState<CopyChannel | null>(null);

  if (result.copySuggestions.length === 0) {
    return <p className="empty-panel-copy">No channel copy was returned.</p>;
  }

  return (
    <div className="copy-list">
      {result.copySuggestions.map((suggestion) => {
        const label = channelLabels[suggestion.channel];
        const isCopied = copied === suggestion.channel;
        const fullCopy = `${suggestion.headline}\n\n${suggestion.body}\n\n${suggestion.callToAction}`;
        return (
          <article key={suggestion.channel} className="copy-row">
            <header>
              <div>
                <span className="copy-channel">{label}</span>
                <h3>{suggestion.headline}</h3>
              </div>
              <button
                type="button"
                className="secondary-button copy-button"
                aria-label={`${isCopied ? 'Copied' : 'Copy'} ${label}`}
                onClick={async () => {
                  await navigator.clipboard.writeText(fullCopy);
                  setCopied(suggestion.channel);
                }}
              >
                {isCopied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </header>
            <p>{suggestion.body}</p>
            <strong className="copy-cta">{suggestion.callToAction}</strong>
            {suggestion.confirmationNeeded.length > 0 ? (
              <div className="confirmation-list">
                <strong>Confirm before publishing</strong>
                <ul>
                  {suggestion.confirmationNeeded.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
