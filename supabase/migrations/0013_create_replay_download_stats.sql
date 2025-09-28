create table if not exists public.replay_download_stats (
  path text primary key,
  download_count bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.increment_replay_download(path_input text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  insert into public.replay_download_stats (path, download_count)
  values (path_input, 1)
  on conflict (path) do update
    set download_count = public.replay_download_stats.download_count + 1,
        updated_at = timezone('utc', now())
  returning download_count into new_count;

  return new_count;
end;
$$;

revoke all on function public.increment_replay_download(path_input text) from public;
grant execute on function public.increment_replay_download(path_input text) to service_role;
