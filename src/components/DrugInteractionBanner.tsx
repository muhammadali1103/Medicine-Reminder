import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface DrugInteractionBannerProps {
  interactionCount: number;
  severeCount: number;
  error: string | null;
  loading?: boolean;
  onOpenDetails?: () => void;
  className?: string;
}

export function DrugInteractionBanner({
  interactionCount,
  severeCount,
  error,
  loading = false,
  onOpenDetails,
  className,
}: DrugInteractionBannerProps) {
  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-border bg-card/90 p-4", className)}>
        <div className="flex items-center gap-3">
          <Icons.refresh className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="font-semibold text-foreground">Checking drug interactions</p>
            <p className="text-sm text-muted-foreground">Reviewing your active medications now.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-2xl border border-warning/30 bg-warning/10 p-4", className)}>
        <div className="flex items-start gap-3">
          <Icons.alertTriangle className="mt-0.5 h-5 w-5 text-warning" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Interaction check unavailable</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (interactionCount === 0) {
    return null;
  }

  const isSevere = severeCount > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        isSevere
          ? "border-destructive/30 bg-destructive/10"
          : "border-warning/30 bg-warning/10",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            isSevere ? "bg-destructive/15" : "bg-warning/15"
          )}
        >
          <Icons.alertTriangle className={cn("h-5 w-5", isSevere ? "text-destructive" : "text-warning")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">
              {interactionCount} drug interaction{interactionCount === 1 ? "" : "s"} detected
            </p>
            <Badge variant={isSevere ? "destructive" : "warning"}>
              {isSevere ? `${severeCount} severe` : "Mild to moderate"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSevere
              ? "Some medications may have a serious interaction. Please review the details carefully."
              : "Some medications may need monitoring or extra care. Review the interaction details."}
          </p>
          {onOpenDetails && (
            <Button
              type="button"
              variant={isSevere ? "destructive" : "outline"}
              size="sm"
              className="mt-3"
              onClick={onOpenDetails}
            >
              Review interactions
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
