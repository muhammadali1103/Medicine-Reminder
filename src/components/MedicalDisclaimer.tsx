import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface MedicalDisclaimerProps {
  variant?: "inline" | "card" | "footer";
  className?: string;
}

export function MedicalDisclaimer({ variant = "inline", className }: MedicalDisclaimerProps) {
  const text = "This app supports medication adherence but does not replace professional medical advice. Always consult your healthcare provider before making changes to your medication regimen.";

  if (variant === "footer") {
    return (
      <div className={cn("text-center py-4 px-6", className)}>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card className={cn("border-primary/20 bg-primary/5", className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Icons.info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-foreground">Medical Disclaimer</p>
              <p className="text-xs text-muted-foreground mt-1">{text}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <Icons.info className="w-4 h-4 shrink-0" />
      <p>{text}</p>
    </div>
  );
}