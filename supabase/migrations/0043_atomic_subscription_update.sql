-- Create function to atomically update subscription data across both tables
-- This ensures data consistency by wrapping all updates in a transaction

CREATE OR REPLACE FUNCTION public.update_subscription_atomic(
  p_auth0_sub TEXT,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_subscription_status TEXT,
  p_cancel_at_period_end BOOLEAN,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ,
  p_price_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app_user_updated BOOLEAN := FALSE;
  v_premium_sub_updated BOOLEAN := FALSE;
  v_trial_marked BOOLEAN := FALSE;
  v_result jsonb;
BEGIN
  -- All operations in this function are atomic (single transaction)

  -- 1. Update app_users table with subscription data
  UPDATE public.app_users
  SET
    stripe_customer_id = p_stripe_customer_id,
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_subscription_status = p_subscription_status,
    stripe_subscription_cancel_at_period_end = p_cancel_at_period_end,
    premium_expires_at = p_current_period_end,
    updated_at = NOW()
  WHERE auth0_sub = p_auth0_sub;

  -- Check if app_user was found and updated
  IF FOUND THEN
    v_app_user_updated := TRUE;
  ELSE
    -- If app_user doesn't exist, create it
    INSERT INTO public.app_users (
      auth0_sub,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_subscription_status,
      stripe_subscription_cancel_at_period_end,
      premium_expires_at
    ) VALUES (
      p_auth0_sub,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_subscription_status,
      p_cancel_at_period_end,
      p_current_period_end
    );
    v_app_user_updated := TRUE;
  END IF;

  -- 2. Upsert premium_subscriptions snapshot
  INSERT INTO public.premium_subscriptions (
    auth0_sub,
    stripe_customer_id,
    stripe_subscription_id,
    status,
    cancel_at_period_end,
    current_period_start,
    current_period_end,
    price_id
  ) VALUES (
    p_auth0_sub,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_subscription_status,
    p_cancel_at_period_end,
    p_current_period_start,
    p_current_period_end,
    p_price_id
  )
  ON CONFLICT (auth0_sub)
  DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    status = EXCLUDED.status,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    price_id = EXCLUDED.price_id,
    updated_at = NOW();

  v_premium_sub_updated := TRUE;

  -- 3. Mark trial as used if subscription is in trialing status
  IF p_subscription_status = 'trialing' THEN
    UPDATE public.app_users
    SET has_used_trial = TRUE
    WHERE auth0_sub = p_auth0_sub
      AND (has_used_trial IS NULL OR has_used_trial = FALSE);

    IF FOUND THEN
      v_trial_marked := TRUE;
    END IF;
  END IF;

  -- Return success result with details
  v_result := jsonb_build_object(
    'success', TRUE,
    'app_user_updated', v_app_user_updated,
    'premium_subscription_updated', v_premium_sub_updated,
    'trial_marked', v_trial_marked
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- If any operation fails, the entire transaction is rolled back
    RAISE WARNING 'Atomic subscription update failed for auth0_sub=%: %', p_auth0_sub, SQLERRM;
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.update_subscription_atomic TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION public.update_subscription_atomic IS
'Atomically updates subscription data across app_users and premium_subscriptions tables. All operations are performed in a single transaction to ensure data consistency. Used by Stripe webhook handler.';
