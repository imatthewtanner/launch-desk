import { describe, expect, it } from 'vitest';

import {
  draftChannelCopy,
  SOCIAL_COPY_CHARACTER_LIMIT,
} from '@/lib/tools/draft-channel-copy';
import type { DraftChannelCopyInput } from '@/lib/tools/types';

const input: DraftChannelCopyInput = {
  productName: 'Atlas reporting',
  outcome: 'Teams can turn delivery data into a shared weekly view.',
  availability: 'Available now to the staged-rollout cohort.',
  audience: 'Engineering managers',
  callToAction: 'Open Atlas reporting',
  knownLimitations: ['Exports are limited to CSV during the staged rollout.'],
  escalationGuidance: 'Escalate launch-blocking issues in #atlas-launch.',
  verifiedFacts: ['Existing project permissions are preserved.'],
  unverifiedFacts: ['Enterprise availability begins on September 1.'],
  channels: [
    'release_notes',
    'email',
    'in_app',
    'social',
    'internal',
    'support',
  ],
};

describe('draftChannelCopy', () => {
  it('caps social copy at the documented channel limit', () => {
    const social = draftChannelCopy(input).find((copy) => copy.channel === 'social');

    expect(social?.body.length).toBeLessThanOrEqual(SOCIAL_COPY_CHARACTER_LIMIT);
    expect(SOCIAL_COPY_CHARACTER_LIMIT).toBe(280);
  });

  it('grounds release notes in the supplied outcome and availability', () => {
    const releaseNotes = draftChannelCopy(input).find(
      (copy) => copy.channel === 'release_notes',
    );

    expect(releaseNotes?.body).toContain(input.outcome);
    expect(releaseNotes?.body).toContain(input.availability);
  });

  it('includes limitations and escalation guidance in support copy', () => {
    const support = draftChannelCopy(input).find((copy) => copy.channel === 'support');

    expect(support?.body).toContain(input.knownLimitations[0]);
    expect(support?.body).toContain(input.escalationGuidance);
  });

  it('keeps unverified facts inside explicit confirmation markers', () => {
    const email = draftChannelCopy(input).find((copy) => copy.channel === 'email');
    const marker = `[CONFIRM: ${input.unverifiedFacts[0]}]`;

    expect(email?.body).toContain(marker);
    expect(email?.confirmationNeeded).toContain(marker);
  });
});
