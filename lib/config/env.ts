import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const booleanString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

const ServerEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    OPENAI_MODEL: z.string().min(1).default('gpt-5.6-terra'),
    LAUNCH_DESK_GUEST_MODE: booleanString('false'),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
    SUPABASE_SECRET_KEY: optionalString,
    OPENAI_TRACING_DISABLED: booleanString('false'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.LAUNCH_DESK_GUEST_MODE) {
      context.addIssue({
        code: 'custom',
        path: ['LAUNCH_DESK_GUEST_MODE'],
        message: 'Guest mode cannot be enabled in production.',
      });
    }

    if (!value.LAUNCH_DESK_GUEST_MODE) {
      const requiredSupabaseFields = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'SUPABASE_SECRET_KEY',
      ] as const;

      for (const field of requiredSupabaseFields) {
        if (!value[field]) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when guest mode is disabled.`,
          });
        }
      }
    }
  });

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
export type PublicEnv = z.infer<typeof PublicEnvSchema>;
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function readServerEnv(source: EnvironmentSource = process.env): ServerEnv {
  return ServerEnvSchema.parse(source);
}

export function readPublicEnv(source: EnvironmentSource = process.env): PublicEnv {
  return PublicEnvSchema.parse(source);
}
