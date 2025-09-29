-- Track individual download events with IP addresses to prevent duplicate counting
create table if not exists public.replay_download_events (
  id bigserial primary key,
  path text not null,
  ip_hash text not null,
  downloaded_at timestamptz not null default timezone('utc', now())
);

-- Index for fast duplicate checking
create index if not exists idx_replay_download_events_path_ip
  on public.replay_download_events(path, ip_hash);

-- Index for cleanup queries (optional, for future purging of old events)
create index if not exists idx_replay_download_events_downloaded_at
  on public.replay_download_events(downloaded_at);

-- Update the increment function to check for existing IP downloads
create or replace function public.increment_replay_download(path_input text, ip_hash_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
  already_downloaded boolean;
begin
  -- Check if this IP has already downloaded this replay
  select exists(
    select 1 from public.replay_download_events
    where path = path_input and ip_hash = ip_hash_input
  ) into already_downloaded;

  -- If already downloaded, return current count without incrementing
  if already_downloaded then
    select download_count into new_count
    from public.replay_download_stats
    where path = path_input;

    -- If no record exists yet, return 0
    if new_count is null then
      new_count := 0;
    end if;

    return jsonb_build_object(
      'download_count', new_count,
      'incremented', false
    );
  end if;

  -- Record this download event
  insert into public.replay_download_events (path, ip_hash)
  values (path_input, ip_hash_input);

  -- Increment the counter
  insert into public.replay_download_stats (path, download_count)
  values (path_input, 1)
  on conflict (path) do update
    set download_count = public.replay_download_stats.download_count + 1,
        updated_at = timezone('utc', now())
  returning download_count into new_count;

  return jsonb_build_object(
    'download_count', new_count,
    'incremented', true
  );
end;
$$;

-- Maintain security: only service_role can execute
revoke all on function public.increment_replay_download(path_input text, ip_hash_input text) from public;
grant execute on function public.increment_replay_download(path_input text, ip_hash_input text) to service_role;

-- Drop the old function signature (without ip_hash parameter)
drop function if exists public.increment_replay_download(path_input text);