"use client";

import { useEffect } from "react";
import { trackPageView } from "@/lib/analytics/tracking-helpers";

interface AccountPageTrackerProps {
  auth0Sub?: string | null;
  hasSubscription?: boolean;
  subscriptionStatus?: string | null;
}

export function AccountPageTracker({ auth0Sub, hasSubscription, subscriptionStatus }: AccountPageTrackerProps) {
  useEffect(() => {
    trackPageView({
      pageName: 'account',
      auth0Sub: auth0Sub || null,
      additionalProperties: {
        has_subscription: hasSubscription,
        subscription_status: subscriptionStatus,
      },
    });
  }, [auth0Sub, hasSubscription, subscriptionStatus]);

  return null;
}
