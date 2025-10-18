"use client";

import { useMemo, useState } from "react";

type GoPremiumButtonProps = {
  profileId: number | null;
  premiumExpiresAt: string | null;
  isPremiumActive?: boolean;
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
}: GoPremiumButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPremium = useMemo(() => {
    if (typeof isPremiumActive === "boolean") {
      return isPremiumActive;
    }
    return isFutureDate(premiumExpiresAt);
  }, [isPremiumActive, premiumExpiresAt]);

  const disabled = loading || !profileId;

  const handleClick = async () => {
    if (!profileId || loading) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
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
  };

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
        {loading ? "Redirecting…" : "Go Premium"}
      </button>
      {!profileId && (
        <p className="text-xs text-neutral-400">
          Link your Dawn of War profile above to enable premium checkout.
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
        {loading ? "Opening portal…" : "Manage subscription"}
      </button>
      {error && (
        <p className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
