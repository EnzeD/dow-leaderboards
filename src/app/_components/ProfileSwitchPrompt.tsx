"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/app/_components/AccountProvider";
import { ADVANCED_STATS_INTENT_STORAGE_KEY } from "@/lib/premium/advanced-stats-intent";

type ProfileSwitchPromptProps = {
  targetProfileId: number;
  targetAlias?: string | null;
  targetCountry?: string | null;
  currentAlias?: string | null;
};

const removeIntentParams = (router: ReturnType<typeof useRouter>) => {
  if (typeof window === "undefined") return;
  const currentUrl = new URL(window.location.href);
  let changed = false;
  const paramsToRemove = ["subscribe", "subscribeIntent", "profileId", "profile_id", "profileID", "pid"];
  for (const param of paramsToRemove) {
    if (currentUrl.searchParams.has(param)) {
      currentUrl.searchParams.delete(param);
      changed = true;
    }
  }
  if (changed) {
    const next = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    router.replace(next);
  }
};

const formatProfileLabel = (alias?: string | null, profileId?: number | null) => {
  if (alias && alias.trim().length > 0) return alias.trim();
  if (profileId) return `Profile ${profileId}`;
  return "this profile";
};

export function ProfileSwitchPrompt({
  targetProfileId,
  targetAlias,
  targetCountry,
  currentAlias,
}: ProfileSwitchPromptProps) {
  const router = useRouter();
  const { refresh } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const clearIntent = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(ADVANCED_STATS_INTENT_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
    }
    removeIntentParams(router);
  }, [router]);

  if (dismissed) {
    return null;
  }

  const handleKeepCurrent = () => {
    clearIntent();
    setDismissed(true);
  };

  const handleSwitch = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId: targetProfileId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? "Failed to switch linked profile.";
        setError(message);
        setLoading(false);
        return;
      }

      await refresh();
      clearIntent();
      setDismissed(true);
      router.refresh();
    } catch (err) {
      console.error("[account] profile switch failed", err);
      setError("Unexpected error switching profiles. Please try again.");
      setLoading(false);
    }
  };

  const nextLabel = formatProfileLabel(targetAlias, targetProfileId);
  const currentLabel = formatProfileLabel(currentAlias);
  const countryLabel = targetCountry ? targetCountry.toUpperCase() : null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/15 p-5 text-sm text-amber-100 shadow-lg shadow-amber-500/20">
      <div className="space-y-3">
        <div>
          <p className="text-base font-semibold text-amber-100">
            Premium is already active for {currentLabel}. Switch to {nextLabel}?
          </p>
          <p className="text-xs text-amber-200/80">
            Moving your subscription keeps daily analytics accurate for the right profile.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleSwitch}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-amber-300/60 bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Switching…" : `Switch to ${nextLabel}`}
          </button>
          <button
            type="button"
            onClick={handleKeepCurrent}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300 hover:text-amber-50 disabled:opacity-70"
          >
            Keep current profile
          </button>
        </div>
        {countryLabel && (
          <p className="text-xs text-amber-200/70">
            New profile region: {countryLabel}
          </p>
        )}
        {error && (
          <p className="text-xs font-semibold text-red-200">{error}</p>
        )}
      </div>
    </div>
  );
}

