"use client";

interface ProBadgeProps {
  size?: "sm" | "md" | "lg";
  clickable?: boolean;
  className?: string;
  onNavigateToPro?: () => void;
}

export default function ProBadge({
  size = "sm",
  clickable = false,
  className = "",
  onNavigateToPro
}: ProBadgeProps) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs leading-tight",
    md: "px-2 py-0.5 text-sm leading-tight",
    lg: "px-2 py-0.5 text-base leading-tight"
  };

  const handleClick = (e: React.MouseEvent) => {
    if (clickable && onNavigateToPro) {
      e.preventDefault();
      e.stopPropagation();
      onNavigateToPro();
    }
  };

  const Component = clickable ? "button" : "span";

  return (
    <Component
      onClick={clickable ? handleClick : undefined}
      className={`inline-flex items-center justify-center rounded border border-amber-400/60 bg-gradient-to-br from-amber-400/30 to-amber-500/40 font-bold italic text-amber-100 shadow-sm shadow-amber-500/20 ${sizeClasses[size]} ${clickable ? "cursor-pointer hover:from-amber-400/40 hover:to-amber-500/50 transition-all" : ""} ${className}`}
      title={clickable ? "Click to learn about Dow: DE Pro" : "Dow: DE Pro member"}
    >
      Pro
    </Component>
  );
}
