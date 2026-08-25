import {
  ChannelCopySuggestionSchema,
  type ChannelCopySuggestion,
  type CopyChannel,
} from '@/lib/contracts/launch';
import {
  DraftChannelCopyInputSchema,
  type DraftChannelCopyInput,
} from '@/lib/tools/types';

export const SOCIAL_COPY_CHARACTER_LIMIT = 280;

type CopyRule = {
  headline: (input: DraftChannelCopyInput) => string;
  body: (input: DraftChannelCopyInput) => string;
};

function sentences(values: string[]): string {
  return values.join(' ');
}

function confirmationMarkers(input: DraftChannelCopyInput): string[] {
  return input.unverifiedFacts.map((fact) => `[CONFIRM: ${fact}]`);
}

function groundedTail(input: DraftChannelCopyInput): string {
  return sentences([...input.verifiedFacts, ...confirmationMarkers(input)]);
}

function withTail(body: string, input: DraftChannelCopyInput): string {
  const tail = groundedTail(input);
  return tail ? `${body} ${tail}` : body;
}

function capSocialCopy(value: string): string {
  if (value.length <= SOCIAL_COPY_CHARACTER_LIMIT) return value;
  return `${value.slice(0, SOCIAL_COPY_CHARACTER_LIMIT - 1).trimEnd()}…`;
}

export const CHANNEL_COPY_RULES: Record<CopyChannel, CopyRule> = {
  release_notes: {
    headline: ({ productName }) => `${productName} launch update`,
    body: (input) =>
      withTail(
        `${input.outcome} ${input.availability} Intended for ${input.audience}.`,
        input,
      ),
  },
  email: {
    headline: ({ productName }) => `Introducing ${productName}`,
    body: (input) =>
      withTail(
        `${input.outcome} ${input.availability} This update is designed for ${input.audience}.`,
        input,
      ),
  },
  in_app: {
    headline: ({ productName }) => `${productName} is ready`,
    body: (input) => withTail(`${input.outcome} ${input.availability}`, input),
  },
  social: {
    headline: ({ productName }) => `${productName} launch`,
    body: (input) =>
      capSocialCopy(
        withTail(
          `${input.productName}: ${input.outcome} ${input.availability} ${input.callToAction}.`,
          input,
        ),
      ),
  },
  internal: {
    headline: ({ productName }) => `Internal launch brief: ${productName}`,
    body: (input) =>
      withTail(
        `${input.outcome} Audience: ${input.audience}. Availability: ${input.availability}`,
        input,
      ),
  },
  support: {
    headline: ({ productName }) => `Support brief: ${productName}`,
    body: (input) => {
      const limitations =
        input.knownLimitations.length > 0
          ? `Known limitations: ${sentences(input.knownLimitations)}`
          : 'Known limitations: none supplied.';
      return withTail(
        `${input.outcome} ${input.availability} ${limitations} ${input.escalationGuidance}`,
        input,
      );
    },
  },
};

export function draftChannelCopy(input: DraftChannelCopyInput): ChannelCopySuggestion[] {
  const parsed = DraftChannelCopyInputSchema.parse(input);
  const markers = confirmationMarkers(parsed);

  return parsed.channels.map((channel) => {
    const rule = CHANNEL_COPY_RULES[channel];
    return ChannelCopySuggestionSchema.parse({
      channel,
      headline: rule.headline(parsed),
      body: rule.body(parsed),
      callToAction: parsed.callToAction,
      confirmationNeeded: markers,
    });
  });
}
