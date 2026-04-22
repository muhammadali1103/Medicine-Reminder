import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export type SafetyLevel = "safe" | "warning" | "danger";

interface SafetyStatusCardProps {
  level: SafetyLevel;
  interactions: number;
  overdueCount: number;
  timingRisk: boolean;
  className?: string;
}

const statusConfig: Record<SafetyLevel, {
  icon: typeof Icons.shield;
  label: string;
  description: string;
  bgClass: string;
  borderClass: string;
  iconClass: string;
}> = {
  safe: {
    icon: Icons.shield,
    label: "No risks detected",
    description: "Your medication schedule is safe. All medications are being taken as prescribed.",
    bgClass: "bg-success/10",
    borderClass: "border-success/30",
    iconClass: "text-success",
  },
  warning: {
    icon: Icons.alertTriangle,
    label: "Timing attention needed",
    description: "Some doses may need attention. Check your schedule for optimal timing.",
    bgClass: "bg-warning/10",
    borderClass: "border-warning/30",
    iconClass: "text-warning",
  },
  danger: {
    icon: Icons.alertTriangle,
    label: "Action required",
    description: "Important medication alerts require your attention. Please review interactions or overdue doses.",
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive/30",
    iconClass: "text-destructive",
  },
};

export function SafetyStatusCard({
  level,
  interactions,
  overdueCount,
  timingRisk,
  className,
}: SafetyStatusCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const config = statusConfig[level];
  const Icon = config.icon;

  const details = [];
  if (interactions > 0) {
    details.push({
      icon: Icons.alertTriangle,
      text: `${interactions} drug interaction${interactions > 1 ? "s" : ""} detected`,
      severity: "high" as const,
    });
  }
  if (overdueCount > 0) {
    details.push({
      icon: Icons.clock,
      text: `${overdueCount} overdue dose${overdueCount > 1 ? "s" : ""}`,
      severity: "medium" as const,
    });
  }
  if (timingRisk) {
    details.push({
      icon: Icons.bell,
      text: "Dose timing may overlap",
      severity: "low" as const,
    });
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowDetails(true)}
        className={cn("cursor-pointer", className)}
      >
        <Card className={cn("border", config.bgClass, config.borderClass)}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                level === "safe" ? "bg-success/20" : level === "warning" ? "bg-warning/20" : "bg-destructive/20"
              )}>
                <Icon className={cn("w-6 h-6", config.iconClass)} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">Medication Safety Status</h3>
                </div>
                <p className={cn(
                  "text-sm font-medium",
                  level === "safe" ? "text-success" : level === "warning" ? "text-warning" : "text-destructive"
                )}>
                  {config.label}
                </p>
              </div>
              <Icons.chevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon className={cn("w-5 h-5", config.iconClass)} />
              Safety Status Details
            </SheetTitle>
            <SheetDescription>{config.description}</SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-3">
            {details.length === 0 ? (
              <div className="text-center py-8">
                <Icons.shield className="w-12 h-12 mx-auto mb-3 text-success" />
                <p className="font-medium text-foreground">All Clear!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No safety concerns with your current medications.
                </p>
              </div>
            ) : (
              details.map((detail, index) => {
                const DetailIcon = detail.icon;
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border",
                      detail.severity === "high"
                        ? "bg-destructive/10 border-destructive/30"
                        : detail.severity === "medium"
                        ? "bg-warning/10 border-warning/30"
                        : "bg-muted border-border"
                    )}
                  >
                    <DetailIcon className={cn(
                      "w-5 h-5",
                      detail.severity === "high"
                        ? "text-destructive"
                        : detail.severity === "medium"
                        ? "text-warning"
                        : "text-muted-foreground"
                    )} />
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {detail.text}
                    </span>
                    <Badge variant={
                      detail.severity === "high"
                        ? "destructive"
                        : detail.severity === "medium"
                        ? "warning"
                        : "secondary"
                    }>
                      {detail.severity === "high" ? "High" : detail.severity === "medium" ? "Medium" : "Low"}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6 pb-4">
            This app supports medication adherence but does not replace professional medical advice.
          </p>
        </SheetContent>
      </Sheet>
    </>
  );
}