import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { type DrugInteractionResult } from "@/services/drugInteractions";
import { cn } from "@/lib/utils";

interface DrugInteractionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interactions: DrugInteractionResult[];
  title?: string;
}

const severityStyles = {
  low: {
    badge: "warning" as const,
    label: "Mild",
    card: "border-warning/25 bg-warning/10",
    icon: "text-warning",
  },
  medium: {
    badge: "warning" as const,
    label: "Moderate",
    card: "border-warning/30 bg-warning/10",
    icon: "text-warning",
  },
  high: {
    badge: "destructive" as const,
    label: "Severe",
    card: "border-destructive/30 bg-destructive/10",
    icon: "text-destructive",
  },
};

export function DrugInteractionModal({
  open,
  onOpenChange,
  interactions,
  title = "Drug Interaction Details",
}: DrugInteractionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.shield className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            These results come from RxNorm interaction data and are written here in simple language for easier review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {interactions.map((interaction) => {
            const styles = severityStyles[interaction.severity];

            return (
              <div
                key={interaction.id}
                className={cn("rounded-2xl border p-4", styles.card)}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Icons.alertTriangle className={cn("mt-0.5 h-5 w-5 shrink-0", styles.icon)} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {interaction.medicationNames.join(" + ")}
                      </p>
                      <Badge variant={styles.badge}>{styles.label}</Badge>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Plain English
                      </p>
                      <p className="text-sm text-foreground">{interaction.description}</p>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Source: {interaction.source}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
