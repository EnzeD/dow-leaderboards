"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";

type AccountDropdownProps = {
  avatarUrl?: string | null;
  displayName: string;
  profileId?: string | null;
};

export function AccountDropdown({ avatarUrl, displayName, profileId }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine logout return URL (same logic as account page)
  const logoutUrl = useMemo(() => {
    if (typeof window === "undefined") return "/auth/logout";

    const baseUrl = window.location.origin;
    return `/auth/logout?returnTo=${encodeURIComponent(baseUrl)}`;
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/60 px-3 py-1.5 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800/70"
        title={`${displayName} menu`}
      >
        {avatarUrl ? (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-700/60 bg-neutral-800/80 text-white shadow-sm">
            <img
              src={avatarUrl}
              alt=""
              className="h-[18px] w-[18px] rounded-full object-cover"
            />
          </span>
        ) : (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-700/60 bg-neutral-800/80 text-white shadow-sm">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
        )}
        <span className="max-w-[8rem] truncate">{displayName}</span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-neutral-700/50 bg-neutral-900 shadow-xl">
          <div className="py-1">
            <Link
              href="/account"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-800/60"
            >
              <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Manage account</span>
            </Link>

            {profileId && displayName !== "Account" && (
              <a
                href={`/?tab=search&q=${encodeURIComponent(displayName)}&pid=${profileId}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-800/60"
              >
                <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>View my profile</span>
              </a>
            )}

            <div className="my-1 border-t border-neutral-700/50" />

            <a
              href={logoutUrl}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-800/60"
            >
              <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Log out</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
