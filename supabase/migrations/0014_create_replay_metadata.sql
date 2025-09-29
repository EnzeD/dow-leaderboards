create table if not exists public.replay_metadata (
  path text primary key,
  original_name text not null,
  replay_name text,
  map_name text,
  match_duration_seconds integer,
  match_duration_label text,
  profiles jsonb,
  raw_metadata jsonb,
  submitted_name text,
  submitted_comment text,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.replay_metadata owner to postgres;
