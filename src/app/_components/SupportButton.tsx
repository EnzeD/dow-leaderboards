"use client";

import Link from "next/link";

const DEFAULT_TIP_URL = "https://ko-fi.com/enzed";

type SupportButtonProps = {
  className?: string;
};

export default function SupportButton({ className = "" }: SupportButtonProps) {
  const tipUrl = process.env.NEXT_PUBLIC_TIP_URL ?? DEFAULT_TIP_URL;

  return (
    <Link
      href={tipUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold shadow-lg bg-yellow-300 text-neutral-900 hover:brightness-95 transition ${className}`.trim()}
      aria-label="Fuel the Crusade"
    >
      <span className="mr-2" role="img" aria-hidden="true">
        ☕
      </span>
      Fuel the Crusade
    </Link>
  );
}
