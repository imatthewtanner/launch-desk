begin;

-- Keep auth lookups in init plans so Postgres evaluates them once per query.
alter policy launches_select_own on public.launches
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy launches_insert_own on public.launches
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy launches_update_own on public.launches
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy launches_delete_own on public.launches
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);

alter policy assets_select_own on public.assets
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy assets_insert_own on public.assets
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy assets_update_own on public.assets
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy assets_delete_own on public.assets
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);

alter policy agent_runs_select_own on public.agent_runs
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy agent_runs_insert_own on public.agent_runs
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy agent_runs_update_own on public.agent_runs
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);
alter policy agent_runs_delete_own on public.agent_runs
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and (select auth.uid()) = user_id);

alter policy launch_assets_select_own on storage.objects
  using (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and bucket_id = 'launch-assets' and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );
alter policy launch_assets_insert_own on storage.objects
  with check (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and bucket_id = 'launch-assets' and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );
alter policy launch_assets_update_own on storage.objects
  using (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and bucket_id = 'launch-assets' and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  )
  with check (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and bucket_id = 'launch-assets' and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );
alter policy launch_assets_delete_own on storage.objects
  using (
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and bucket_id = 'launch-assets' and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and (storage.foldername(name))[3] = 'launches'
  );

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
        coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
        and topic like 'launch:%'
        and exists (
          select 1 from public.launches l
          where l.id = split_part(topic, ':', 2)::uuid and l.user_id = (select auth.uid())
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
        coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
        and topic like 'launch:%'
        and exists (
          select 1 from public.launches l
          where l.id = split_part(topic, ':', 2)::uuid and l.user_id = (select auth.uid())
        )
      )
    $policy$;
  end if;
end;
$$;

-- The MCP tables are intentionally available only to the trusted service role.
create policy mcp_launch_reviews_service_role_all
  on public.mcp_launch_reviews for all to service_role using (true) with check (true);
create policy mcp_issue_previews_service_role_all
  on public.mcp_issue_previews for all to service_role using (true) with check (true);

create index if not exists mcp_issue_previews_review_id_idx
  on public.mcp_issue_previews (review_id);

commit;
