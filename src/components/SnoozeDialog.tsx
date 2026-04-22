import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface SnoozeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationName: string;
  onSnooze: (minutes: number) => void;
  onTakeNow: () => void;
  onSkip: () => void;
}

const snoozeOptions = [
  { minutes: 5, label: "5 min", icon: "⏱️" },
  { minutes: 10, label: "10 min", icon: "⏰" },
  { minutes: 15, label: "15 min", icon: "🕐" },
];

export function SnoozeDialog({
  open,
  onOpenChange,
  medicationName,
  onSnooze,
  onTakeNow,
  onSkip,
}: SnoozeDialogProps) {
  const [selectedSnooze, setSelectedSnooze] = useState<number | null>(null);

  const handleSnooze = (minutes: number) => {
    setSelectedSnooze(minutes);
    onSnooze(minutes);
    onOpenChange(false);
    setSelectedSnooze(null);
  };

  const handleTakeNow = () => {
    onTakeNow();
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.bell className="w-5 h-5 text-primary animate-pulse" />
            Medication Reminder
          </DialogTitle>
          <DialogDescription>
            Time to take <span className="font-semibold text-foreground">{medicationName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Take Now Button */}
          <Button
            className="w-full h-14 text-lg"
            variant="success"
            onClick={handleTakeNow}
          >
            <Icons.checkCircle className="w-5 h-5 mr-2" />
            Take Now
          </Button>

          {/* Snooze Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground text-center">
              Or snooze for...
            </p>
            <div className="grid grid-cols-3 gap-2">
              {snoozeOptions.map((option) => (
                <motion.div key={option.minutes} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-16 flex flex-col gap-1",
                      selectedSnooze === option.minutes && "ring-2 ring-primary"
                    )}
                    onClick={() => handleSnooze(option.minutes)}
                  >
                    <span className="text-xl">{option.icon}</span>
                    <span className="text-sm font-medium">{option.label}</span>
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Skip Button */}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive"
            onClick={handleSkip}
          >
            <Icons.xCircle className="w-4 h-4 mr-2" />
            Skip this dose
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
