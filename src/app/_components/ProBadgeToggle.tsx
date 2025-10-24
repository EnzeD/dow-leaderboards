"use client";

import { useCallback, useEffect, useState } from "react";
import ProBadge from "@/components/ProBadge";

export function ProBadgeToggle() {
  const [showBadge, setShowBadge] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const response = await fetch("/api/account/badge-visibility");
        if (response.ok) {
          const data = await response.json();
          setShowBadge(data.showBadge ?? true);
        }
      } catch (err) {
        console.error("Failed to fetch badge visibility", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSetting();
  }, []);

  const handleToggle = useCallback(async () => {
    const newValue = !showBadge;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/account/badge-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showBadge: newValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to update setting");
      }

      setShowBadge(newValue);
    } catch (err) {
      console.error("Failed to update badge visibility", err);
      setError("Failed to save setting. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [showBadge]);

  if (loading) {
    return <p className="mt-4 text-sm text-neutral-400">Loading...</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">Show Pro badge publicly</span>
          <ProBadge size="sm" clickable={false} />
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            showBadge ? "bg-amber-500" : "bg-neutral-600"
          } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
          aria-label={showBadge ? "Hide Pro badge" : "Show Pro badge"}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              showBadge ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        When enabled, your Pro badge will appear next to your name on leaderboards, replays, match history, and search results.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
