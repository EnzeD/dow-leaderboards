"use client";

import Link from "next/link";

interface ProBadgeProps {
  size?: "sm" | "md" | "lg";
  clickable?: boolean;
  className?: string;
}

export default function ProBadge({
  size = "sm",
  clickable = true,
  className = ""
}: ProBadgeProps) {
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[0.65rem]",
    md: "px-2 py-1 text-xs",
    lg: "px-2.5 py-1.5 text-sm"
  };

  const badge = (
    <span
      className={`inline-flex items-center justify-center rounded border border-amber-400/60 bg-gradient-to-br from-amber-400/30 to-amber-500/40 font-bold italic text-amber-100 shadow-sm shadow-amber-500/20 ${sizeClasses[size]} ${className}`}
      title="Dow: DE Pro member"
    >
      Pro
    </span>
  );

  if (clickable) {
    return (
      <Link
        href="/pro"
        className="inline-flex transition-transform hover:scale-105"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </Link>
    );
  }

  return badge;
}
