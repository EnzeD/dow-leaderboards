"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ADVANCED_STATS_INTENT_STORAGE_KEY } from "@/lib/premium/advanced-stats-intent";

type AdvancedStatsIntentBannerProps = {
  active: boolean;
  intentAlias?: string | null;
};

type StoredIntentPayload = {
  alias?: string;
  redirectUrl?: string;
  profileId?: string | number;
  storedAt?: string;
};

const formatProfileLabel = (alias?: string | null) => {
  if (alias && alias.trim().length > 0) return alias.trim();
  return "this profile";
};

const sanitizeUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.toString();
  } catch {
    return null;
  }
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

export function AdvancedStatsIntentBanner({ active, intentAlias }: AdvancedStatsIntentBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [storedAlias, setStoredAlias] = useState<string | null>(intentAlias ?? null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem(ADVANCED_STATS_INTENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredIntentPayload;
        const derivedAlias =
          intentAlias && intentAlias.trim().length > 0
            ? intentAlias.trim()
            : typeof parsed?.alias === "string"
              ? parsed.alias.trim()
              : null;
        setStoredAlias(derivedAlias && derivedAlias.length > 0 ? derivedAlias : null);
        const sanitizedUrl = sanitizeUrl(parsed?.redirectUrl);
        if (sanitizedUrl) {
          setReturnUrl(sanitizedUrl);
        }
      }
    } catch {
      // ignore malformed storage payloads
    }
  }, [active, intentAlias]);

  useEffect(() => {
    if (!active) return;
    removeIntentParams(router);
  }, [active, router]);

  const clearIntent = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(ADVANCED_STATS_INTENT_STORAGE_KEY);
      } catch {
        // ignore storage removal failures
      }
    }
  }, []);

  const handleDismiss = () => {
    clearIntent();
    setDismissed(true);
  };

  const handleStartSubscription = () => {
    const section = document.getElementById("premium-billing");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.classList.add("ring-2", "ring-yellow-400/70");
      window.setTimeout(() => {
        section.classList.remove("ring-2", "ring-yellow-400/70");
      }, 1500);
    }
  };

  const handleReturnToSearch = () => {
    if (!returnUrl) return;
    clearIntent();
    window.location.href = returnUrl;
  };

  const displayAlias = useMemo(() => formatProfileLabel(storedAlias ?? intentAlias), [intentAlias, storedAlias]);

  if (!active || dismissed) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 text-sm text-yellow-100 shadow-lg shadow-yellow-500/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-base font-semibold text-yellow-200">
            Ready to unlock advanced analytics for {displayAlias}?
          </p>
          <p className="text-xs text-yellow-100/80">
            Finish your subscription below, or jump back to the search page once you&apos;re set.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleStartSubscription}
            className="inline-flex items-center justify-center rounded-md border border-yellow-400/60 bg-yellow-400 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-300"
          >
            Start subscription flow
          </button>
          {returnUrl && (
            <button
              type="button"
              onClick={handleReturnToSearch}
              className="inline-flex items-center justify-center rounded-md border border-yellow-400/40 px-4 py-2 text-sm font-semibold text-yellow-200 transition hover:border-yellow-300 hover:text-yellow-100"
            >
              Back to search result
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center justify-center rounded-md border border-transparent px-3 py-2 text-xs font-semibold text-yellow-300 transition hover:text-yellow-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

