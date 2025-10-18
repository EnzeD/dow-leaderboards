"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AutocompleteSearch from "@/components/AutocompleteSearch";
import type { PlayerSearchResult } from "@/lib/supabase";
import { useAccount } from "@/app/_components/AccountProvider";

type Props = {
  initialProfileId: number | null;
  initialAlias: string | null;
  initialCountry: string | null;
  initialAvatarUrl?: string | null;
};

export function AccountProfileLinker({
  initialProfileId,
  initialAlias,
  initialCountry,
  initialAvatarUrl,
}: Props) {
  const router = useRouter();
  const { account, refresh } = useAccount();
  const [searchValue, setSearchValue] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Use live data from AccountProvider (don't fallback to initial props - they're stale)
  const profileId = account?.profile?.profileId ?? null;
  const profileAlias = account?.profile?.alias ?? null;
  const profileCountry = account?.profile?.country ?? null;
  const profileAvatarUrl = account?.profile?.avatarUrl ?? null;

  const handleSelect = (player: PlayerSearchResult) => {
    setSelectedPlayer(player);
    setError(null);
  };

  const handleExactSearch = () => {
    setError("Please pick a profile from the dropdown to link it.");
  };

  const linkProfile = async () => {
    if (!selectedPlayer) {
      setError("Select a profile before linking.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId: selectedPlayer.profile_id,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error ?? "Failed to link profile.";
        setError(message);
        setSaving(false);
        return;
      }

      await refresh();
      router.refresh();
      setSaving(false);
      setSelectedPlayer(null);
      setSearchValue("");
    } catch (err) {
      console.error("[account] link profile failed", err);
      setError("Unexpected error linking profile. Please try again.");
      setSaving(false);
    }
  };

  const unlinkProfile = async () => {
    try {
      setSaving(true);
      setError(null);
      const response = await fetch("/api/account/profile", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error ?? "Failed to unlink profile.";
        setError(message);
        setSaving(false);
        return;
      }

      await refresh();
      router.refresh();
      setSaving(false);
      setSelectedPlayer(null);
      setSearchValue("");
    } catch (err) {
      console.error("[account] unlink profile failed", err);
      setError("Unexpected error unlinking profile. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/30 p-4 text-sm text-neutral-300">
        {profileId ? (
          <div className="flex items-start gap-3">
            {profileAvatarUrl && (
              <img
                src={profileAvatarUrl}
                alt="Profile avatar"
                className="h-12 w-12 rounded-full border border-neutral-700/60 object-cover"
              />
            )}
            <div className="flex-1">
              <p className="text-neutral-100">
                <span className="font-semibold">Linked profile:</span>{" "}
                {profileAlias ?? profileId}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Profile ID {profileId}
                {profileCountry ? ` • ${profileCountry}` : ""}
              </p>
              <button
                type="button"
                onClick={unlinkProfile}
                disabled={saving}
                className="mt-3 inline-flex items-center rounded-md border border-red-500/60 bg-red-700/30 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-700/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Removing…" : "Unlink profile"}
              </button>
            </div>
          </div>
        ) : (
          <p>No Dawn of War profile linked yet.</p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm text-neutral-300">
          Search for your in-game alias and link it to your account.
        </p>
        <AutocompleteSearch
          value={searchValue}
          onChange={setSearchValue}
          onSelect={handleSelect}
          onExactSearch={handleExactSearch}
          placeholder="Search your alias…"
        />
        {selectedPlayer && (
          <div className="flex items-center justify-between rounded-lg border border-neutral-700/40 bg-neutral-800/40 px-4 py-3 text-sm text-neutral-200">
            <div className="flex flex-col">
              <span className="font-semibold">{selectedPlayer.current_alias}</span>
              <span className="text-xs text-neutral-400">
                ID {selectedPlayer.profile_id}
              </span>
            </div>
            <button
              type="button"
              onClick={linkProfile}
              disabled={saving}
              className="inline-flex items-center rounded-md border border-emerald-500/60 bg-emerald-700/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-700/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Linking…" : "Link profile"}
            </button>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-300">{error}</p>
        )}
      </div>
    </div>
  );
}
