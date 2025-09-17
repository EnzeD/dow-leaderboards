"use client";

import { useState } from "react";

export default function ShareLink() {
  const [copied, setCopied] = useState(false);

  const currentUrl = () => (typeof window !== "undefined" ? window.location.href : "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const share = async () => {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ url: currentUrl(), title: "DOW Leaderboards" });
        return;
      } catch {
        // fallback to copy
      }
    }
    copy();
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        className="flex-1 bg-neutral-900 border border-neutral-600/50 rounded-md px-3 py-2 text-sm text-white select-all"
        readOnly
        value={currentUrl()}
        aria-label="Sharable URL"
      />
      <button
        className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-md text-sm transition-colors"
        type="button"
        onClick={copy}
        title="Copy URL"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-md text-sm transition-colors"
        type="button"
        onClick={share}
        title="Share"
      >
        Share
      </button>
    </div>
  );
}
