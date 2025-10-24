"use client";

interface ProBadgeProps {
  size?: "sm" | "md" | "lg";
  clickable?: boolean;
  className?: string;
}

export default function ProBadge({
  size = "sm",
  clickable = false,
  className = ""
}: ProBadgeProps) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs leading-tight",
    md: "px-2 py-0.5 text-sm leading-tight",
    lg: "px-2 py-0.5 text-base leading-tight"
  };

  return (
    <span
      className={`inline-flex items-center justify-center rounded border border-amber-400/60 bg-gradient-to-br from-amber-400/30 to-amber-500/40 font-bold italic text-amber-100 shadow-sm shadow-amber-500/20 ${sizeClasses[size]} ${className}`}
      title="Dow: DE Pro member"
    >
      Pro
    </span>
  );
}
