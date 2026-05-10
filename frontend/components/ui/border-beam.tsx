"use client";

interface BorderBeamProps {
  className?: string;
}

export function BorderBeam({ className }: BorderBeamProps) {
  return (
    <span
      className={className}
      style={{
        position: "absolute",
        inset: -1,
        borderRadius: "inherit",
        padding: 1,
        background: "conic-gradient(from 0deg, transparent, #f5a623, transparent 70%)",
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        animation: "shimmer 2s linear infinite",
        pointerEvents: "none",
      }}
    />
  );
}
