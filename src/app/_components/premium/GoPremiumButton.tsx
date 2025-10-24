"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";

type GoPremiumButtonProps = {
  profileId: number | null;
  premiumExpiresAt: string | null;
  isPremiumActive?: boolean;
  returnToProfileId?: number | null;
  autoTrigger?: boolean;
};

const isFutureDate = (iso: string | null): boolean => {
  if (!iso) return false;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return false;
  return parsed > Date.now();
};

export function GoPremiumButton({
  profileId,
  premiumExpiresAt,
  isPremiumActive,
  returnToProfileId,
  autoTrigger = false,
}: GoPremiumButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasTriggered = useRef(false);

  const hasPremium = useMemo(() => {
    if (typeof isPremiumActive === "boolean") {
      return isPremiumActive;
    }
    return isFutureDate(premiumExpiresAt);
  }, [isPremiumActive, premiumExpiresAt]);

  const disabled = loading || !profileId;

  const handleClick = useCallback(async () => {
    if (!profileId || loading) return;
    hasTriggered.current = true;
    try {
      setLoading(true);
      setError(null);

      // Build custom return URLs if returnToProfileId is provided
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const body: Record<string, unknown> = { profileId };

      if (returnToProfileId && baseUrl) {
        body.successUrl = `${baseUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}&returnTo=${returnToProfileId}`;
        body.cancelUrl = `${baseUrl}/account?checkout=cancelled&returnTo=${returnToProfileId}`;
      }

      const response = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error ?? "Failed to start checkout.";
        setError(message);
        setLoading(false);
        return;
      }

      const data = await response.json().catch(() => null);
      const url = data?.url;

      if (typeof url === "string" && url.length > 0) {
        window.location.assign(url);
        return;
      }

      setError("Checkout session missing redirect URL.");
      setLoading(false);
    } catch (err) {
      console.error("[premium] checkout failed", err);
      setError("Unexpected error starting checkout. Please try again.");
      setLoading(false);
    }
  }, [profileId, loading, returnToProfileId]);

  // Auto-trigger checkout when requested
  useEffect(() => {
    if (autoTrigger && !hasTriggered.current && profileId && !hasPremium && !loading) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        handleClick();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoTrigger, profileId, hasPremium, loading, handleClick]);

  if (hasPremium) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="inline-flex items-center justify-center rounded-lg border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Starting trial…" : "Start free trial"}
      </button>
      {!profileId ? (
        <p className="text-xs text-neutral-400">
          Link your Dawn of War profile above to start your Pro trial.
        </p>
      ) : (
        <p className="text-xs text-neutral-400">
          7-day free trial • $4.99/month after
        </p>
      )}
      {error && (
        <p className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

type ManageSubscriptionButtonProps = {
  stripeCustomerId: string | null;
};

export function ManageSubscriptionButton({
  stripeCustomerId,
}: ManageSubscriptionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!stripeCustomerId) {
    return null;
  }

  const handleClick = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/premium/portal", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error ?? "Failed to open billing portal.";
        setError(message);
        setLoading(false);
        return;
      }

      const data = await response.json().catch(() => null);
      const url = data?.url;

      if (typeof url === "string" && url.length > 0) {
        window.location.assign(url);
        return;
      }

      setError("Billing portal missing redirect URL.");
      setLoading(false);
    } catch (err) {
      console.error("[premium] portal failed", err);
      setError("Unexpected error opening billing portal. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-lg border border-neutral-600/60 bg-neutral-800/40 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-700/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening portal…" : "Manage Pro membership"}
      </button>
      {error && (
        <p className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
