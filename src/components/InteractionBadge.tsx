import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type InteractionLevel = "safe" | "monitor" | "risk";

interface InteractionBadgeProps {
  level: InteractionLevel;
  showLabel?: boolean;
  tooltip?: string;
  className?: string;
  onClick?: () => void;
}

const levelConfig: Record<InteractionLevel, {
  icon: typeof Icons.shield;
  label: string;
  bgClass: string;
  textClass: string;
  tooltipText: string;
}> = {
  safe: {
    icon: Icons.shield,
    label: "Safe",
    bgClass: "bg-success/10 hover:bg-success/20",
    textClass: "text-success",
    tooltipText: "No known interactions with your other medications",
  },
  monitor: {
    icon: Icons.eye,
    label: "Monitor",
    bgClass: "bg-warning/10 hover:bg-warning/20",
    textClass: "text-warning",
    tooltipText: "Minor interaction possible - monitor for side effects",
  },
  risk: {
    icon: Icons.alertTriangle,
    label: "Risk",
    bgClass: "bg-destructive/10 hover:bg-destructive/20",
    textClass: "text-destructive",
    tooltipText: "Potential interaction detected - consult your pharmacist",
  },
};

export function InteractionBadge({
  level,
  showLabel = false,
  tooltip,
  className,
  onClick,
}: InteractionBadgeProps) {
  const config = levelConfig[level];
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 cursor-pointer border-0 transition-colors",
        config.bgClass,
        config.textClass,
        onClick && "hover:scale-105",
        className
      )}
      onClick={onClick}
    >
      <Icon className="w-3 h-3" />
      {showLabel && <span className="text-xs">{config.label}</span>}
    </Badge>
  );

  if (tooltip || !showLabel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{tooltip || config.tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}