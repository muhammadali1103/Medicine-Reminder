import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface MedicationSupply {
  id: string;
  name: string;
  pillsRemaining: number | null;
  dosesPerDay: number;
  daysLeft: number | null;
  refillReminder: boolean;
}

export function RefillTracker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [medications, setMedications] = useState<MedicationSupply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchMedications = async () => {
      const { data, error } = await apiClient
        .from("medications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching medications:", error);
        return;
      }

      const meds = data.map((med) => {
        const schedule = med.schedule as { times?: string[] } | null;
        const dosesPerDay = schedule?.times?.length || 1;
        const daysLeft = med.pills_remaining
          ? Math.floor(med.pills_remaining / dosesPerDay)
          : null;

        return {
          id: med.id,
          name: med.name,
          pillsRemaining: med.pills_remaining,
          dosesPerDay,
          daysLeft,
          refillReminder: med.refill_reminder ?? true,
        };
      });

      setMedications(meds);
      setLoading(false);
    };

    fetchMedications();
  }, [user]);

  const updatePillCount = async (medId: string, newCount: number) => {
    const { error } = await apiClient
      .from("medications")
      .update({ pills_remaining: newCount })
      .eq("id", medId);

    if (error) {
      toast.error("Failed to update pill count");
      return;
    }

    setMedications((prev) =>
      prev.map((m) => {
        if (m.id === medId) {
          const daysLeft = Math.floor(newCount / m.dosesPerDay);
          return { ...m, pillsRemaining: newCount, daysLeft };
        }
        return m;
      })
    );
    toast.success("Pill count updated");
  };

  const getSupplyStatus = (daysLeft: number | null) => {
    if (daysLeft === null) return "unknown";
    if (daysLeft <= 3) return "critical";
    if (daysLeft <= 7) return "low";
    return "good";
  };

  const lowSupplyMeds = medications.filter((m) => {
    const status = getSupplyStatus(m.daysLeft);
    return status === "critical" || status === "low";
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.package className="w-4 h-4 text-primary" />
            Refill Tracker
          </div>
          {lowSupplyMeds.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {lowSupplyMeds.length} Low
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {medications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No medications to track
          </p>
        ) : (
          medications.map((med, index) => {
            const status = getSupplyStatus(med.daysLeft);
            const progressValue =
              med.daysLeft !== null ? Math.min((med.daysLeft / 30) * 100, 100) : 0;

            return (
              <motion.div
                key={med.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-foreground">
                    {med.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {status === "critical" && (
                      <Badge variant="destructive" className="text-xs">
                        <Icons.alertTriangle className="w-3 h-3 mr-1" />
                        Refill Now
                      </Badge>
                    )}
                    {status === "low" && (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-warning/20 text-warning-foreground"
                      >
                        Low Supply
                      </Badge>
                    )}
                  </div>
                </div>

                <Progress
                  value={progressValue}
                  className={`h-2 ${
                    status === "critical"
                      ? "[&>div]:bg-destructive"
                      : status === "low"
                      ? "[&>div]:bg-warning"
                      : ""
                  }`}
                />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {med.pillsRemaining !== null
                      ? `${med.pillsRemaining} pills remaining`
                      : "Count not set"}
                  </span>
                  <span>
                    {med.daysLeft !== null
                      ? `~${med.daysLeft} days left`
                      : "Unknown"}
                  </span>
                </div>

                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => {
                      const newCount = prompt(
                        "Enter current pill count:",
                        String(med.pillsRemaining || 0)
                      );
                      if (newCount && !isNaN(Number(newCount))) {
                        updatePillCount(med.id, Number(newCount));
                      }
                    }}
                  >
                    Update Count
                  </Button>
                  {(status === "critical" || status === "low") && (
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => navigate("/pharmacy-locator")}
                    >
                      Find Pharmacy
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
