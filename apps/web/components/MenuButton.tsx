"use client";

import React from "react";

interface MenuButtonProps {
  title: string;
  subtitle: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

export const MenuButton = ({
  title,
  subtitle,
  onClick,
  variant = "primary",
}: MenuButtonProps) => {
  // Base classes including the neo-brutalist utility
  const baseClasses =
    "brutal-button w-full text-left mb-4 flex flex-col items-start justify-center p-6 transition-all duration-200";

  // Variant specific colors
  const colorClasses =
    variant === "primary"
      ? "bg-card text-text-primary hover:bg-surface"
      : "bg-brutal-accent text-brutal-black hover:brightness-110";

  return (
    <button className={`${baseClasses} ${colorClasses}`} onClick={onClick}>
      <span className="text-xl font-bold uppercase tracking-wide">{title}</span>
      <span className="text-sm font-medium text-text-muted mt-1">
        {subtitle}
      </span>
    </button>
  );
};
