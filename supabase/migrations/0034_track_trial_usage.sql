-- Track whether user has used their free trial
alter table public.app_users
add column if not exists has_used_trial boolean not null default false;

comment on column public.app_users.has_used_trial is
  'Whether the user has previously used their free trial';
