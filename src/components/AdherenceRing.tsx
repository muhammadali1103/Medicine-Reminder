import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AdherenceRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
  showStats?: boolean;
  taken?: number;
  missed?: number;
  variant?: "default" | "hero";
}

export function AdherenceRing({
  percentage,
  size = 120,
  strokeWidth = 12,
  className,
  showLabel = true,
  showStats = false,
  taken = 0,
  missed = 0,
  variant = "default",
}: AdherenceRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (variant === "hero") return "hsl(var(--primary-foreground))";
    if (percentage >= 80) return "hsl(var(--success))";
    if (percentage >= 50) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  const getTrackColor = () => {
    if (variant === "hero") return "hsl(var(--primary-foreground) / 0.25)";
    return "hsl(var(--muted))";
  };

  // Calculate responsive font size based on ring size
  const getFontSize = () => {
    if (size <= 60) return "text-sm";
    if (size <= 80) return "text-base";
    if (size <= 100) return "text-lg";
    if (size <= 120) return "text-xl";
    return "text-2xl";
  };

  const getSubFontSize = () => {
    if (size <= 60) return "text-[8px]";
    if (size <= 80) return "text-[9px]";
    if (size <= 100) return "text-[10px]";
    return "text-xs";
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getTrackColor()}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
          <motion.span
            className={cn(
              "font-bold leading-none",
              variant === "hero" ? "text-primary-foreground drop-shadow-sm" : "text-foreground",
              getFontSize()
            )}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            {percentage}%
          </motion.span>
          <span
            className={cn(
              "leading-tight mt-0.5",
              variant === "hero" ? "text-primary-foreground/80" : "text-muted-foreground",
              getSubFontSize()
            )}
          >
            Adherence
          </span>
        </div>
      )}
      {showStats && !showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
          <motion.span
            className={cn(
              "font-bold leading-none",
              variant === "hero" ? "text-primary-foreground drop-shadow-sm" : "text-foreground",
              getFontSize()
            )}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            {percentage}%
          </motion.span>
        </div>
      )}
    </div>
  );
}
