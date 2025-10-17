alter table public.app_users
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_subscription_cancel_at_period_end boolean;

comment on column public.app_users.stripe_subscription_status is
  'Last known Stripe subscription status for the linked customer.';

comment on column public.app_users.stripe_subscription_cancel_at_period_end is
  'Flag mirroring Stripe''s cancel_at_period_end for the active subscription.';
