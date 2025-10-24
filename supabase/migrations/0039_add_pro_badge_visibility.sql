-- Add show_pro_badge column to app_users
alter table public.app_users
add column if not exists show_pro_badge boolean not null default true;

comment on column public.app_users.show_pro_badge is
  'Whether the user wants to display their Pro badge publicly';
