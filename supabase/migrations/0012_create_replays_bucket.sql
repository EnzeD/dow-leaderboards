insert into storage.buckets (id, name, public)
values ('replays', 'replays', false)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public;

update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = '{"application/octet-stream"}'
  where id = 'replays';
