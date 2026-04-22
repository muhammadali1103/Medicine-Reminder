import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Icons } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface TakenConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationName: string;
  dosage: string;
  strength?: string;
  lastTakenTime?: Date | null;
  minIntervalHours?: number;
  onConfirm: () => void;
}

export function TakenConfirmationModal({
  open,
  onOpenChange,
  medicationName,
  dosage,
  strength,
  lastTakenTime,
  minIntervalHours = 4,
  onConfirm,
}: TakenConfirmationModalProps) {
  const now = new Date();
  const isTooSoon = lastTakenTime && 
    (now.getTime() - lastTakenTime.getTime()) < (minIntervalHours * 60 * 60 * 1000);

  const nextSafeTime = lastTakenTime
    ? new Date(lastTakenTime.getTime() + minIntervalHours * 60 * 60 * 1000)
    : null;

  const handleConfirm = () => {
    if (!isTooSoon) {
      onConfirm();
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icons.pill className="w-5 h-5 text-primary" />
            Confirm Dose
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                You are about to log that you're taking:
              </p>
              
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
                <p className="font-bold text-lg text-foreground">{medicationName}</p>
                {strength && (
                  <p className="text-sm text-muted-foreground">{strength}</p>
                )}
                <Badge variant="secondary" className="mt-2">
                  {dosage}
                </Badge>
              </div>

              {lastTakenTime && (
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    Last taken: {format(lastTakenTime, "h:mm a")} ({format(lastTakenTime, "MMM d")})
                  </p>
                  {nextSafeTime && (
                    <p className="text-muted-foreground">
                      Next safe dose: {format(nextSafeTime, "h:mm a")}
                    </p>
                  )}
                </div>
              )}

              {isTooSoon && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Icons.alertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">Too Soon</p>
                      <p className="text-sm text-muted-foreground">
                        Please wait until {nextSafeTime && format(nextSafeTime, "h:mm a")} before taking another dose.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isTooSoon}
            className={isTooSoon ? "opacity-50 cursor-not-allowed" : ""}
          >
            <Icons.check className="w-4 h-4 mr-2" />
            Confirm Taken
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}