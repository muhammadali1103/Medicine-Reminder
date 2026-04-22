import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PillIconProps {
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

function PillSvg({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <defs>
        <linearGradient id={`pillGradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary-glow))" />
        </linearGradient>
      </defs>
      <path
        d="M19.778 4.222a6.242 6.242 0 0 0-8.829 0l-6.727 6.728a6.242 6.242 0 1 0 8.829 8.828l6.727-6.727a6.242 6.242 0 0 0 0-8.83Z"
        fill={`url(#pillGradient-${color})`}
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
      />
      <path
        d="m7.5 16.5 9-9"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function PillIcon({ color = "primary", size = "md", className, animate = false }: PillIconProps) {
  if (animate) {
    return (
      <motion.div
        className={cn("relative flex items-center justify-center", sizeClasses[size], className)}
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" as const }}
      >
        <PillSvg color={color} />
      </motion.div>
    );
  }

  return (
    <div className={cn("relative flex items-center justify-center", sizeClasses[size], className)}>
      <PillSvg color={color} />
    </div>
  );
}

interface MedicationAvatarProps {
  shape: "round" | "oval" | "capsule" | "tablet";
  color1: string;
  color2?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function MedicationAvatar({ shape, color1, color2, size = "md", className }: MedicationAvatarProps) {
  const sizeMap = {
    sm: 32,
    md: 48,
    lg: 64,
  };

  const s = sizeMap[size];

  return (
    <div
      className={cn("flex items-center justify-center rounded-xl overflow-hidden", className)}
      style={{ width: s, height: s }}
    >
      <svg width={s} height={s} viewBox="0 0 48 48">
        <defs>
          <linearGradient id={`med-${shape}-${color1}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2 || color1} />
          </linearGradient>
        </defs>
        {shape === "round" && (
          <circle cx="24" cy="24" r="20" fill={`url(#med-${shape}-${color1})`} />
        )}
        {shape === "oval" && (
          <ellipse cx="24" cy="24" rx="22" ry="16" fill={`url(#med-${shape}-${color1})`} />
        )}
        {shape === "capsule" && (
          <rect x="4" y="14" width="40" height="20" rx="10" fill={`url(#med-${shape}-${color1})`} />
        )}
        {shape === "tablet" && (
          <rect x="8" y="8" width="32" height="32" rx="6" fill={`url(#med-${shape}-${color1})`} />
        )}
      </svg>
    </div>
  );
}
