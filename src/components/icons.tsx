import type { SVGAttributes } from "react";

type IconProps = SVGAttributes<SVGSVGElement> & {
  className?: string;
};

const mergeClassName = (base: string, extra?: string) =>
  extra ? `${base} ${extra}` : base;

export function AccountIcon({
  className,
  ["aria-hidden"]: ariaHidden,
  ...props
}: IconProps) {
  const hidden = ariaHidden ?? true;
  return (
    <svg
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden={hidden}
      role={hidden ? undefined : "img"}
      className={mergeClassName("h-4 w-4 text-white", className)}
      {...props}
    >
      <circle
        cx="12"
        cy="8"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5.5 20a6.5 6.5 0 0 1 13 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
