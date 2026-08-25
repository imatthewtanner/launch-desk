import { describe, expect, it } from 'vitest';

import { readPublicEnv, readServerEnv } from '@/lib/config/env';

describe('environment boundaries', () => {
  it('accepts a server key without exposing it in public configuration', () => {
    const source = {
      OPENAI_API_KEY: 'test-secret',
      OPENAI_MODEL: 'current-model',
      LAUNCH_DESK_GUEST_MODE: 'true',
    };

    expect(readServerEnv(source).OPENAI_API_KEY).toBe('test-secret');
    expect(readPublicEnv(source)).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('rejects production guest mode', () => {
    expect(() =>
      readServerEnv({
        NODE_ENV: 'production',
        OPENAI_API_KEY: 'test-secret',
        OPENAI_MODEL: 'current-model',
        LAUNCH_DESK_GUEST_MODE: 'true',
      }),
    ).toThrow(/guest mode/i);
  });
});
