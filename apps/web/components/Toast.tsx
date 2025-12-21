"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({
  message,
  type = "info",
  duration = 3000,
  onClose,
}: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onClose, 300); // Wait for fade-out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgClass = {
    success: "bg-btn-success",
    error: "bg-warning-bg",
    info: "bg-btn-primary",
    warning: "bg-warning-bg",
  }[type];

  return (
    <div
      className={`
        fixed bottom-8 right-8 z-[100]
        brutal-border p-4 min-w-[300px] brutal-shadow
        ${bgClass} text-text-on-dark font-bold
        transition-all duration-300
        ${isExiting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}
      `}
    >
      <div className="flex justify-between items-center gap-4">
        <p>{message}</p>
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(onClose, 300);
          }}
          className="hover:scale-110 transition-transform cursor-pointer"
        >
          ×
        </button>
      </div>
    </div>
  );
}

