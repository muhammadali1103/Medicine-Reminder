import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface InteractionDetail {
  id: string;
  medications: string[];
  riskLevel: "low" | "medium" | "high";
  interactionType: string;
  description: string;
  mechanism?: string;
  clinicalEffects?: string[];
  recommendations?: string[];
  monitoringAdvice?: string;
  acknowledged?: boolean;
}

interface InteractionDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interaction: InteractionDetail | null;
  onAcknowledge?: (id: string) => void;
}

const severityConfig = {
  low: {
    label: "Low Risk",
    bgClass: "bg-success/10",
    textClass: "text-success",
    borderClass: "border-success/30",
    icon: Icons.check,
    description: "Minor interaction - typically safe with standard precautions",
  },
  medium: {
    label: "Moderate Risk",
    bgClass: "bg-warning/10",
    textClass: "text-warning",
    borderClass: "border-warning/30",
    icon: Icons.eye,
    description: "Monitor for side effects - may require dose adjustments",
  },
  high: {
    label: "High Risk",
    bgClass: "bg-destructive/10",
    textClass: "text-destructive",
    borderClass: "border-destructive/30",
    icon: Icons.alertTriangle,
    description: "Serious interaction - consult healthcare provider immediately",
  },
};

export function InteractionDetailsModal({
  open,
  onOpenChange,
  interaction,
  onAcknowledge,
}: InteractionDetailsModalProps) {
  if (!interaction) return null;

  const config = severityConfig[interaction.riskLevel];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                config.bgClass
              )}
            >
              <Icon className={cn("w-5 h-5", config.textClass)} />
            </div>
            <div>
              <DialogTitle className="text-left">Drug Interaction</DialogTitle>
              <Badge
                variant="outline"
                className={cn(
                  "mt-1 border",
                  config.bgClass,
                  config.textClass,
                  config.borderClass
                )}
              >
                {config.label}
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-left">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Medications Involved */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Icons.pill className="w-4 h-4 text-primary" />
              Medications Involved
            </h4>
            <div className="flex flex-wrap gap-2">
              {interaction.medications.map((med, i) => (
                <Badge key={i} variant="secondary">
                  {med}
                </Badge>
              ))}
            </div>
          </div>

          {/* Interaction Type */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Icons.info className="w-4 h-4 text-primary" />
              Interaction Type
            </h4>
            <p className="text-sm text-muted-foreground">
              {interaction.interactionType}
            </p>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Icons.fileText className="w-4 h-4 text-primary" />
              Description
            </h4>
            <p className="text-sm text-muted-foreground">
              {interaction.description}
            </p>
          </div>

          {/* Mechanism */}
          {interaction.mechanism && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Icons.settings className="w-4 h-4 text-primary" />
                How It Happens
              </h4>
              <p className="text-sm text-muted-foreground">
                {interaction.mechanism}
              </p>
            </div>
          )}

          {/* Clinical Effects */}
          {interaction.clinicalEffects && interaction.clinicalEffects.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Icons.alertCircle className="w-4 h-4 text-primary" />
                Possible Effects
              </h4>
              <ul className="space-y-1">
                {interaction.clinicalEffects.map((effect, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-muted-foreground mt-1">•</span>
                    {effect}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {interaction.recommendations && interaction.recommendations.length > 0 && (
            <div
              className={cn(
                "p-3 rounded-lg border",
                config.bgClass,
                config.borderClass
              )}
            >
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Icons.check className="w-4 h-4" />
                Clinical Recommendations
              </h4>
              <ul className="space-y-2">
                {interaction.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="text-sm flex items-start gap-2"
                  >
                    <span className="font-medium text-primary">{i + 1}.</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Monitoring Advice */}
          {interaction.monitoringAdvice && (
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Icons.eye className="w-4 h-4 text-primary" />
                Monitoring Advice
              </h4>
              <p className="text-sm text-muted-foreground">
                {interaction.monitoringAdvice}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {!interaction.acknowledged && onAcknowledge && (
            <Button
              className="flex-1"
              onClick={() => {
                onAcknowledge(interaction.id);
                onOpenChange(false);
              }}
            >
              <Icons.check className="w-4 h-4 mr-2" />
              I Understand
            </Button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          This information is for educational purposes only. Always consult
          your healthcare provider for medical advice.
        </p>
      </DialogContent>
    </Dialog>
  );
}
