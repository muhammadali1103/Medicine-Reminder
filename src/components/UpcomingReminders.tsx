import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ReminderItem {
  id: string;
  medicationName: string;
  time: string;
  dosage: string;
  status: "pending" | "taken" | "missed" | "upcoming";
}

interface UpcomingRemindersProps {
  reminders: ReminderItem[];
  onTaken?: (id: string) => void;
  onSkip?: (id: string) => void;
  className?: string;
}

const statusConfig = {
  pending: { variant: "warning" as const, label: "Due now", icon: Icons.clock, gradient: "from-amber-500 to-orange-500" },
  taken: { variant: "success" as const, label: "Taken", icon: Icons.checkCircle, gradient: "from-emerald-500 to-green-500" },
  missed: { variant: "destructive" as const, label: "Missed", icon: Icons.xCircle, gradient: "from-red-500 to-rose-500" },
  upcoming: { variant: "secondary" as const, label: "Upcoming", icon: Icons.clock, gradient: "from-slate-400 to-slate-500" },
};

export function UpcomingReminders({
  reminders,
  onTaken,
  onSkip,
  className,
}: UpcomingRemindersProps) {
  const pendingCount = reminders.filter(r => r.status === "pending").length;
  const takenCount = reminders.filter(r => r.status === "taken").length;

  return (
    <Card className={cn("overflow-hidden border-0 shadow-lg", className)}>
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Icons.bell className="w-4 h-4 text-primary-foreground" />
            </div>
            Today's Schedule
          </CardTitle>
          <div className="flex gap-2">
            {takenCount > 0 && (
              <Badge variant="success" className="gap-1">
                <Icons.check className="w-3 h-3" />
                {takenCount}
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="warning" className="gap-1 animate-pulse">
                <Icons.clock className="w-3 h-3" />
                {pendingCount} due
              </Badge>
            )}
            {pendingCount === 0 && takenCount === 0 && (
              <Badge variant="pill">{reminders.length} doses</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {reminders.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center mx-auto mb-3">
              <Icons.checkCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="font-semibold text-foreground">All done for today!</p>
            <p className="text-sm text-muted-foreground mt-1">Great job staying on track</p>
          </motion.div>
        ) : (
          reminders.map((reminder, index) => {
            const config = statusConfig[reminder.status];
            const StatusIcon = config.icon;
            
            return (
              <motion.div
                key={reminder.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08, type: "spring", stiffness: 100 }}
                className={cn(
                  "relative flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 hover:scale-[1.02]",
                  reminder.status === "pending"
                    ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 shadow-md"
                    : reminder.status === "taken"
                    ? "bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border border-emerald-200 dark:border-emerald-800"
                    : reminder.status === "missed"
                    ? "bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border border-red-200 dark:border-red-800"
                    : "bg-muted/50 border border-border"
                )}
              >
                {/* Time Badge */}
                <div className={cn(
                  "flex flex-col items-center justify-center min-w-[70px] h-[70px] rounded-xl",
                  reminder.status === "pending" 
                    ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30" 
                    : reminder.status === "taken"
                    ? "bg-gradient-to-br from-emerald-500 to-green-500 text-white"
                    : reminder.status === "missed"
                    ? "bg-gradient-to-br from-red-500 to-rose-500 text-white"
                    : "bg-slate-200 dark:bg-slate-700 text-foreground"
                )}>
                  <span className="text-lg font-bold leading-none">{reminder.time.split(" ")[0]}</span>
                  <span className="text-xs opacity-90">{reminder.time.split(" ")[1]}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-foreground truncate">{reminder.medicationName}</p>
                    <Badge variant={config.variant} className="shrink-0 text-xs">
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Icons.pill className="w-3.5 h-3.5" />
                    {reminder.dosage}
                  </p>
                </div>

                {/* Action Button */}
                {reminder.status === "pending" && onTaken && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: index * 0.1 + 0.2 }}
                  >
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/30 gap-1.5"
                      onClick={() => onTaken(reminder.id)}
                    >
                      <Icons.check className="w-4 h-4" />
                      Take
                    </Button>
                  </motion.div>
                )}

                {reminder.status === "taken" && (
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Icons.check className="w-5 h-5 text-white" />
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
