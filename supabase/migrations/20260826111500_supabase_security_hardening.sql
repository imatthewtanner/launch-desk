begin;

-- Supabase anonymous users use the authenticated Postgres role. Require a
-- non-anonymous JWT in addition to row ownership for workspace data.
alter policy launches_select_own on public.launches
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy launches_insert_own on public.launches
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy launches_update_own on public.launches
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  )
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy launches_delete_own on public.launches
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );

alter policy assets_select_own on public.assets
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy assets_insert_own on public.assets
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy assets_update_own on public.assets
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  )
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy assets_delete_own on public.assets
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );

alter policy agent_runs_select_own on public.agent_runs
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy agent_runs_insert_own on public.agent_runs
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy agent_runs_update_own on public.agent_runs
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  )
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );
alter policy agent_runs_delete_own on public.agent_runs
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and (select auth.uid()) = user_id
  );

alter policy launch_assets_select_own on storage.objects
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and bucket_id = 'launch-assets'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );
alter policy launch_assets_insert_own on storage.objects
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and bucket_id = 'launch-assets'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );
alter policy launch_assets_update_own on storage.objects
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and bucket_id = 'launch-assets'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  )
  with check (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and bucket_id = 'launch-assets'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );
alter policy launch_assets_delete_own on storage.objects
  using (
    (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
    and bucket_id = 'launch-assets'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );

-- Trigger functions need no public RPC permission. Their triggers continue to
-- execute as the function owner.
do $$
begin
  if to_regprocedure('public.broadcast_launches_changes()') is not null then
    execute 'revoke execute on function public.broadcast_launches_changes() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.broadcast_assets_changes()') is not null then
    execute 'revoke execute on function public.broadcast_assets_changes() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.broadcast_agent_runs_changes()') is not null then
    execute 'revoke execute on function public.broadcast_agent_runs_changes() from public, anon, authenticated';
  end if;
end;
$$;

-- Realtime policies may be absent in a fresh project. Harden them when the
-- broadcast integration is installed and wrap auth calls as init plans.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'authenticated_can_receive_launch_broadcasts'
  ) then
    execute $policy$
      alter policy authenticated_can_receive_launch_broadcasts on realtime.messages
      using (
        (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
        and topic like 'launch:%'
        and exists (
          select 1 from public.launches l
          where l.id = split_part(topic, ':', 2)::uuid
            and l.user_id = (select auth.uid())
        )
      )
    $policy$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'authenticated_can_send_launch_broadcasts'
  ) then
    execute $policy$
      alter policy authenticated_can_send_launch_broadcasts on realtime.messages
      with check (
        (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false
        and topic like 'launch:%'
        and exists (
          select 1 from public.launches l
          where l.id = split_part(topic, ':', 2)::uuid
            and l.user_id = (select auth.uid())
        )
      )
    $policy$;
  end if;
end;
$$;

commit;
