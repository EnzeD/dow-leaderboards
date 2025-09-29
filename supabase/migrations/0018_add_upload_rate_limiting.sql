-- Track upload attempts for rate limiting
create table if not exists public.replay_upload_attempts (
  id bigserial primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default timezone('utc', now())
);

-- Index for fast rate limit checks
create index if not exists idx_replay_upload_attempts_ip_time
  on public.replay_upload_attempts(ip_hash, attempted_at);

-- Function to check if IP can upload (returns true if allowed, false if rate limited)
create or replace function public.check_upload_rate_limit(ip_hash_input text, max_uploads integer, window_hours integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_uploads integer;
begin
  -- Count uploads from this IP in the time window
  select count(*) into recent_uploads
  from public.replay_upload_attempts
  where ip_hash = ip_hash_input
    and attempted_at > timezone('utc', now()) - (window_hours || ' hours')::interval;

  -- If under the limit, record this attempt and allow
  if recent_uploads < max_uploads then
    insert into public.replay_upload_attempts (ip_hash)
    values (ip_hash_input);
    return true;
  end if;

  -- Rate limited
  return false;
end;
$$;

-- Maintain security: only service_role can execute
revoke all on function public.check_upload_rate_limit(ip_hash_input text, max_uploads integer, window_hours integer) from public;
grant execute on function public.check_upload_rate_limit(ip_hash_input text, max_uploads integer, window_hours integer) to service_role;

-- Optional: Cleanup function to remove old attempts (run periodically)
create or replace function public.cleanup_old_upload_attempts(days_to_keep integer default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.replay_upload_attempts
  where attempted_at < timezone('utc', now()) - (days_to_keep || ' days')::interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_upload_attempts(days_to_keep integer) from public;
grant execute on function public.cleanup_old_upload_attempts(days_to_keep integer) to service_role;