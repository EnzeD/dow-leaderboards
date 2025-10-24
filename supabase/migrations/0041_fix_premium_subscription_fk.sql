-- Ensure premium_subscriptions stays linked when Auth0 provider changes

alter table public.premium_subscriptions
  drop constraint if exists premium_subscriptions_auth0_sub_fkey;

alter table public.premium_subscriptions
  add constraint premium_subscriptions_auth0_sub_fkey
  foreign key (auth0_sub)
  references public.app_users(auth0_sub)
  on delete cascade
  on update cascade;
