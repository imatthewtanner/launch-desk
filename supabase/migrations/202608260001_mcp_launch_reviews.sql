create table if not exists public.mcp_launch_reviews (
  id uuid primary key,
  owner_subject text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcp_launch_reviews_owner_subject_idx
  on public.mcp_launch_reviews (owner_subject, created_at desc);

create table if not exists public.mcp_issue_previews (
  id uuid primary key,
  review_id uuid not null references public.mcp_launch_reviews(id) on delete cascade,
  owner_subject text not null,
  expires_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcp_issue_previews_owner_subject_idx
  on public.mcp_issue_previews (owner_subject, created_at desc);

alter table public.mcp_launch_reviews enable row level security;
alter table public.mcp_issue_previews enable row level security;

revoke all on public.mcp_launch_reviews from anon, authenticated;
revoke all on public.mcp_issue_previews from anon, authenticated;

comment on table public.mcp_launch_reviews is 'Server-owned MCP launch review payloads, partitioned by verified subject.';
comment on table public.mcp_issue_previews is 'Server-owned immutable approval previews and idempotent issue creation results.';
