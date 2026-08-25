begin;

drop index if exists public.assets_launch_id_idx;
drop index if exists public.agent_runs_launch_id_idx;
drop index if exists public.agent_runs_parent_run_id_idx;

create index assets_launch_owner_idx
  on public.assets (launch_id, user_id);

create index agent_runs_launch_owner_idx
  on public.agent_runs (launch_id, user_id);

create index agent_runs_parent_owner_idx
  on public.agent_runs (parent_run_id, user_id)
  where parent_run_id is not null;

commit;
