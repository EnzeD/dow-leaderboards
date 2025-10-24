"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trackAccountInteraction } from "@/lib/analytics/tracking-helpers";

export function RefreshSubscriptionButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);

    // Track the interaction
    trackAccountInteraction({
      action: 'subscription_refreshed',
      auth0Sub: null, // Will be set by tracker from session
    });

    try {
      const response = await fetch("/api/premium/sync-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to refresh subscription status");
      }

      const result = await response.json();

      console.log("[RefreshSubscriptionButton] Sync result:", result);

      setMessage({
        type: "success",
        text: "Subscription status refreshed successfully",
      });

      // Refresh the page data after 1 second to show the success message
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error) {
      console.error("Failed to refresh subscription:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to refresh subscription status",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-600/50 bg-neutral-800/40 px-5 py-2 font-semibold text-neutral-100 transition hover:bg-neutral-700/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRefreshing ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Refreshing...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            Refresh subscription status
          </>
        )}
      </button>

      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.type === "success"
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
              : "border-red-500/50 bg-red-500/15 text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
