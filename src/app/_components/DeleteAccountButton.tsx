"use client";

import { useState } from "react";

type Props = {
  logoutUrl: string;
};

export function DeleteAccountButton({ logoutUrl }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleting) return;
    setError(null);

    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This will remove your premium access and linked billing information.",
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error ?? "Unable to delete your account.";
        setError(message);
        setDeleting(false);
        return;
      }

      window.location.href = logoutUrl;
    } catch (err) {
      console.error("[account] delete failed", err);
      setError("Unexpected error deleting your account. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex items-center justify-center rounded-lg border border-red-600/60 bg-red-700/30 px-5 py-2 font-semibold text-red-200 transition hover:bg-red-700/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {deleting ? "Deleting…" : "Delete account"}
      </button>
      {error && (
        <span className="text-xs text-red-300">
          {error}
        </span>
      )}
    </div>
  );
}
