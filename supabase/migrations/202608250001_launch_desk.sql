begin;

create table public.launches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  product_brief text not null check (char_length(product_brief) between 1 and 12000),
  audience text not null check (char_length(audience) between 1 and 2000),
  launch_date date not null,
  constraints text not null default '' check (char_length(constraints) <= 4000),
  status text not null default 'draft' check (
    status in ('draft', 'ready', 'running', 'completed', 'partial', 'failed', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  filename text not null check (char_length(filename) between 1 and 255),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/webp'
    )
  ),
  byte_size bigint not null check (byte_size between 0 and 20971520),
  created_at timestamptz not null default now(),
  constraint assets_launch_owner_fk
    foreign key (launch_id, user_id)
    references public.launches (id, user_id)
    on delete cascade,
  constraint assets_owner_path_check check (
    storage_path like 'users/' || user_id::text || '/launches/' || launch_id::text || '/%'
  ),
  unique (id, user_id)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_run_id uuid,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')
  ),
  model text not null check (char_length(model) between 1 and 120),
  trace_id text check (trace_id is null or char_length(trace_id) <= 255),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_category text check (
    error_category is null or error_category in (
      'authentication',
      'model_unavailable',
      'rate_limit',
      'network',
      'timeout',
      'tool',
      'stream',
      'schema',
      'validation',
      'cancelled',
      'unknown'
    )
  ),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  usage_summary jsonb,
  final_result jsonb,
  created_at timestamptz not null default now(),
  constraint agent_runs_launch_owner_fk
    foreign key (launch_id, user_id)
    references public.launches (id, user_id)
    on delete cascade,
  constraint agent_runs_json_objects_check check (
    (usage_summary is null or jsonb_typeof(usage_summary) = 'object')
    and (final_result is null or jsonb_typeof(final_result) = 'object')
  ),
  unique (id, user_id),
  constraint agent_runs_parent_owner_fk
    foreign key (parent_run_id, user_id)
    references public.agent_runs (id, user_id)
    on delete set null (parent_run_id)
);

create index launches_user_id_idx on public.launches (user_id);
create index launches_user_created_at_idx on public.launches (user_id, created_at desc);
create index assets_user_id_idx on public.assets (user_id);
create index assets_launch_id_idx on public.assets (launch_id);
create index agent_runs_user_id_idx on public.agent_runs (user_id);
create index agent_runs_launch_id_idx on public.agent_runs (launch_id);
create index agent_runs_parent_run_id_idx on public.agent_runs (parent_run_id)
  where parent_run_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger launches_set_updated_at
before update on public.launches
for each row execute function public.set_updated_at();

alter table public.launches enable row level security;
alter table public.assets enable row level security;
alter table public.agent_runs enable row level security;

create policy "launches_select_own"
on public.launches for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "launches_insert_own"
on public.launches for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "launches_update_own"
on public.launches for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "launches_delete_own"
on public.launches for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "assets_select_own"
on public.assets for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "assets_insert_own"
on public.assets for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "assets_update_own"
on public.assets for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "assets_delete_own"
on public.assets for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "agent_runs_select_own"
on public.agent_runs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "agent_runs_insert_own"
on public.agent_runs for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "agent_runs_update_own"
on public.agent_runs for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "agent_runs_delete_own"
on public.agent_runs for delete
to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.launches to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.agent_runs to authenticated;
revoke all on public.launches from anon;
revoke all on public.assets from anon;
revoke all on public.agent_runs from anon;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'launch-assets',
  'launch-assets',
  false,
  20971520,
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "launch_assets_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'launch-assets'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (storage.foldername(name))[3] = 'launches'
);

create policy "launch_assets_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'launch-assets'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (storage.foldername(name))[3] = 'launches'
);

create policy "launch_assets_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'launch-assets'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (storage.foldername(name))[3] = 'launches'
)
with check (
  bucket_id = 'launch-assets'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (storage.foldername(name))[3] = 'launches'
);

create policy "launch_assets_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'launch-assets'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (storage.foldername(name))[3] = 'launches'
);

commit;
