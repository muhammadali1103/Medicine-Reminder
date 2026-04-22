import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface Interaction {
  id: string;
  medication1: string;
  medication2: string;
  riskLevel: "low" | "medium" | "high";
  description: string;
  acknowledged: boolean;
}

interface InteractionWarningProps {
  interactions: Interaction[];
  onAcknowledge?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  className?: string;
}

const riskConfig = {
  low: {
    color: "bg-warning/10 border-warning/30 text-warning-foreground",
    badge: "warning" as const,
    label: "Low Risk",
    icon: Icons.alertTriangle,
  },
  medium: {
    color: "bg-warning/20 border-warning/50 text-warning-foreground",
    badge: "warning" as const,
    label: "Medium Risk",
    icon: Icons.alertTriangle,
  },
  high: {
    color: "bg-destructive/15 border-destructive/40 text-foreground",
    badge: "destructive" as const,
    label: "High Risk",
    icon: Icons.shield,
  },
};

export function InteractionWarning({
  interactions,
  onAcknowledge,
  onViewDetails,
  className,
}: InteractionWarningProps) {
  const unacknowledged = interactions.filter((i) => !i.acknowledged);

  if (unacknowledged.length === 0) return null;

  return (
    <Card variant="danger" className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Icons.shield className="w-5 h-5" />
          Drug Interactions Detected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {unacknowledged.map((interaction, index) => {
          const config = riskConfig[interaction.riskLevel];
          const RiskIcon = config.icon;

          return (
            <motion.div
              key={interaction.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "p-4 rounded-xl border-2 transition-all",
                config.color
              )}
            >
              <div className="flex items-start gap-3">
                <RiskIcon className="w-5 h-5 mt-0.5 text-destructive flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">
                      {interaction.medication1}
                    </span>
                    <span className="text-muted-foreground">×</span>
                    <span className="font-semibold text-foreground">
                      {interaction.medication2}
                    </span>
                    <Badge variant={config.badge} className="ml-auto">
                      {config.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {interaction.description}
                  </p>
                  <div className="flex gap-2 mt-3">
                    {onViewDetails && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewDetails(interaction.id)}
                      >
                        Learn More
                      </Button>
                    )}
                    {onAcknowledge && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onAcknowledge(interaction.id)}
                      >
                        I Understand
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
