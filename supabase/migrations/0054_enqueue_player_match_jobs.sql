create or replace function public.enqueue_player_match_jobs(p_jobs jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(p_jobs) is distinct from 'array' then
    raise exception 'p_jobs must be a JSON array';
  end if;

  insert into public.crawl_jobs (kind, payload, priority)
  select
    'player_matches'::public.crawl_job_kind,
    job.value->'payload',
    coalesce((job.value->>'priority')::integer, 10)
  from jsonb_array_elements(p_jobs) as job(value)
  where jsonb_typeof(job.value->'payload') = 'object'
    and nullif(job.value->'payload'->>'profile_id', '') is not null
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.enqueue_player_match_jobs(jsonb) from public;
revoke all on function public.enqueue_player_match_jobs(jsonb) from anon, authenticated;
grant execute on function public.enqueue_player_match_jobs(jsonb) to service_role;

notify pgrst, 'reload schema';
