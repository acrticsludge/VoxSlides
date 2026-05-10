"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  background?: string;
}

const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ className, children, background, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center overflow-hidden rounded-lg px-6 py-3 font-semibold text-white transition-all",
          "bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]",
          "hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={{
          background: background
            ? `linear-gradient(90deg, ${background}22 0%, ${background} 50%, ${background}22 100%)`
            : "linear-gradient(90deg, #f5a62322 0%, #f5a623 50%, #f5a62322 100%)",
          backgroundSize: "200% 100%",
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ShimmerButton.displayName = "ShimmerButton";
export { ShimmerButton };
