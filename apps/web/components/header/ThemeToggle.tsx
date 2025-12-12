"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "../ThemeProvider";

type Theme = "light" | "dark" | "system";

const themeOptions: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "💻" },
];

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = themeOptions.find((opt) => opt.value === theme);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return null; // or return a placeholder/skeleton
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-card brutal-border brutal-shadow-sm font-bold text-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-hover active:translate-x-0.5 active:translate-y-0.5 active:shadow-brutal-active"
        aria-label="Toggle theme"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">{currentOption?.icon}</span>
        <span className="hidden sm:inline">{currentOption?.label}</span>
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label="Theme options"
          className="absolute right-0 top-full mt-2 z-50 min-w-[140px] bg-card brutal-border brutal-shadow-sm"
        >
          {themeOptions.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={theme === option.value}
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-left font-medium text-sm transition-colors hover:bg-surface ${
                  theme === option.value
                    ? "bg-highlight-bg text-foreground"
                    : "text-text-muted"
                }`}
              >
                <span aria-hidden="true">{option.icon}</span>
                <span>{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
