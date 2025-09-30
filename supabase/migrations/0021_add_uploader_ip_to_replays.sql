-- Add uploader IP hash to track who uploaded each replay
alter table public.replay_metadata
  add column if not exists uploader_ip_hash text;

-- Index for fast ownership checks
create index if not exists idx_replay_metadata_uploader_ip
  on public.replay_metadata(uploader_ip_hash);

-- Function to verify replay ownership (returns true if IP matches uploader)
create or replace function public.verify_replay_ownership(path_input text, ip_hash_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_ip_hash text;
begin
  -- Get the uploader IP hash for this replay
  select uploader_ip_hash into stored_ip_hash
  from public.replay_metadata
  where path = path_input;

  -- If no IP hash stored (old replays), deny access
  if stored_ip_hash is null then
    return false;
  end if;

  -- Check if provided IP matches stored IP
  return stored_ip_hash = ip_hash_input;
end;
$$;

-- Function to delete replay and all associated data (with IP verification)
create or replace function public.delete_replay_with_verification(path_input text, ip_hash_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean;
begin
  -- Verify ownership
  select public.verify_replay_ownership(path_input, ip_hash_input) into is_owner;

  if not is_owner then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  -- Delete player links
  delete from public.replay_player_links
  where replay_path = path_input;

  -- Delete download stats
  delete from public.replay_download_stats
  where path = path_input;

  -- Delete download events
  delete from public.replay_download_events
  where path = path_input;

  -- Delete metadata (this is the main record)
  delete from public.replay_metadata
  where path = path_input;

  return jsonb_build_object('success', true);
end;
$$;

-- Security: only service_role can execute these functions
revoke all on function public.verify_replay_ownership(path_input text, ip_hash_input text) from public;
grant execute on function public.verify_replay_ownership(path_input text, ip_hash_input text) to service_role;

revoke all on function public.delete_replay_with_verification(path_input text, ip_hash_input text) from public;
grant execute on function public.delete_replay_with_verification(path_input text, ip_hash_input text) to service_role;