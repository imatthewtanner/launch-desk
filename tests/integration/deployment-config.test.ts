import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function readOptional(relativePath: string): Promise<string> {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

describe('production infrastructure configuration', () => {
  it('defines a Cloudflare vinext build with Workers compatibility', async () => {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const wrangler = await readOptional('wrangler.jsonc');
    const vite = await readOptional('vite.config.ts');
    const eslint = await readOptional('eslint.config.mjs');

    expect(packageJson.scripts?.['build:vinext']).toBeTruthy();
    expect(packageJson.scripts?.['deploy:vinext']).toBeTruthy();
    expect(packageJson.scripts?.typecheck).toContain('next typegen');
    expect(packageJson.dependencies?.vinext ?? packageJson.devDependencies?.vinext).toBeTruthy();
    expect(wrangler).toContain('nodejs_compat');
    expect(wrangler).toContain('observability');
    expect(vite).toContain('vinext');
    expect(eslint).toContain("'dist/**'");
    expect(eslint).toContain("'.vinext/**'");
  });

  it('keeps Supabase service access and realtime trigger hardening in migrations', async () => {
    const migrationDirectory = path.join(root, 'supabase', 'migrations');
    const migrationFiles = await readdir(migrationDirectory);
    const migrations = await Promise.all(
      migrationFiles.map((file) => readFile(path.join(migrationDirectory, file), 'utf8')),
    );
    const sql = migrations.join('\n');

    expect(sql).toContain('grant select, insert, update, delete on public.mcp_launch_reviews to service_role');
    expect(sql).toContain('revoke execute on function public.broadcast_launches_changes() from public, anon, authenticated');
    expect(sql).toContain("(select auth.jwt()) ->> 'is_anonymous'");
    expect(sql).toContain('create policy mcp_launch_reviews_service_role_all');
    expect(sql).toContain('create index if not exists mcp_issue_previews_review_id_idx');
  });
});
