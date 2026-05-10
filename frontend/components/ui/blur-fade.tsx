"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface BlurFadeProps {
  children: React.ReactNode;
  inView?: boolean;
  className?: string;
}

export function BlurFade({ children, inView = true, className }: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, filter: "blur(8px)" }}
      animate={
        inView && isInView
          ? { opacity: 1, filter: "blur(0px)" }
          : { opacity: 1, filter: "blur(0px)" }
      }
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
