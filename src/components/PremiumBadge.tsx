import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PremiumBadgeProps {
  className?: string;
  showText?: boolean;
}

export function PremiumBadge({ className, showText = false }: PremiumBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
              className
            )}
          >
            <Icons.lock className="w-3 h-3" />
            {showText && <span className="text-xs">Premium</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Premium feature - Upgrade to unlock</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PremiumOverlayProps {
  children: React.ReactNode;
  isPremium?: boolean;
  featureName?: string;
}

export function PremiumOverlay({ children, isPremium = false, featureName }: PremiumOverlayProps) {
  if (!isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-60 pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px] rounded-xl">
        <div className="text-center p-4">
          <Icons.lock className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm font-medium text-foreground">
            {featureName || "Premium Feature"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Upgrade to unlock
          </p>
        </div>
      </div>
    </div>
  );
}