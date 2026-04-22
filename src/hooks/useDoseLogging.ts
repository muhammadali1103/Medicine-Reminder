import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { enqueueSyncAction } from "@/services/syncQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export interface DoseLog {
  id: string;
  medication_id: string;
  scheduled_time: string;
  taken_time: string | null;
  status: "pending" | "taken" | "missed" | "late" | "skipped";
  notes: string | null;
}

export interface AdherenceStats {
  totalDoses: number;
  takenDoses: number;
  missedDoses: number;
  lateDoses: number;
  skippedDoses: number;
  adherenceScore: number;
  weeklyScore: number;
  monthlyScore: number;
  streak: number;
}

export function useDoseLogging() {
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [loading, setLoading] = useState(false);

  const logDose = useCallback(
    async (
      medicationId: string,
      scheduledTime: Date,
      status: "taken" | "missed" | "late" | "skipped",
      notes?: string
    ) => {
      if (!user) {
        toast.error("Please sign in to log doses");
        return null;
      }

      setLoading(true);
      try {
        const takenTime = status === "taken" || status === "late" ? new Date().toISOString() : null;
        const payload = {
          medication_id: medicationId,
          user_id: user.id,
          scheduled_time: scheduledTime.toISOString(),
          taken_time: takenTime,
          status,
          notes: notes || null,
        };

        if (!isOnline) {
          const queued = enqueueSyncAction("LOG_DOSE", payload);
          toast.info("Dose saved offline. It will sync when you're back online.");
          return {
            id: queued.id,
            medication_id: medicationId,
            scheduled_time: scheduledTime.toISOString(),
            taken_time: takenTime,
            status,
            notes: notes || null,
          };
        }

        const { data, error } = await apiClient.from("dose_logs").insert(payload).select().single();

        if (error) {
          console.error("Error logging dose:", error);
          toast.error("Failed to log dose");
          return null;
        }

        return data;
      } catch (err) {
        console.error("Unexpected error:", err);
        toast.error("An error occurred");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [isOnline, user]
  );

  const updateDoseStatus = useCallback(
    async (doseLogId: string, status: "taken" | "missed" | "late" | "skipped") => {
      if (!user) return false;

      try {
        const takenTime = status === "taken" || status === "late" ? new Date().toISOString() : null;

        const { error } = await apiClient
          .from("dose_logs")
          .update({ status, taken_time: takenTime })
          .eq("id", doseLogId);

        if (error) {
          console.error("Error updating dose:", error);
          toast.error("Failed to update dose");
          return false;
        }

        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        return false;
      }
    },
    [user]
  );

  const getDoseLogs = useCallback(
    async (medicationId?: string, startDate?: Date, endDate?: Date) => {
      if (!user) return [];

      try {
        let query = apiClient
          .from("dose_logs")
          .select("*")
          .eq("user_id", user.id)
          .order("scheduled_time", { ascending: false });

        if (medicationId) {
          query = query.eq("medication_id", medicationId);
        }

        if (startDate) {
          query = query.gte("scheduled_time", startDate.toISOString());
        }

        if (endDate) {
          query = query.lte("scheduled_time", endDate.toISOString());
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching dose logs:", error);
          return [];
        }

        return data as DoseLog[];
      } catch (err) {
        console.error("Unexpected error:", err);
        return [];
      }
    },
    [user]
  );

  return {
    logDose,
    updateDoseStatus,
    getDoseLogs,
    loading,
  };
}

export function useAdherenceStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdherenceStats>({
    totalDoses: 0,
    takenDoses: 0,
    missedDoses: 0,
    lateDoses: 0,
    skippedDoses: 0,
    adherenceScore: 0,
    weeklyScore: 0,
    monthlyScore: 0,
    streak: 0,
  });
  const [loading, setLoading] = useState(true);

  const calculateStats = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all dose logs for the past month
      const { data: logs, error } = await apiClient
        .from("dose_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("scheduled_time", monthAgo.toISOString())
        .order("scheduled_time", { ascending: false });

      if (error) {
        console.error("Error fetching adherence stats:", error);
        setLoading(false);
        return;
      }

      const allLogs = logs || [];
      const weeklyLogs = allLogs.filter(
        (log) => new Date(log.scheduled_time) >= weekAgo
      );

      const calculateScore = (logList: typeof allLogs) => {
        if (logList.length === 0) return 0;
        const taken = logList.filter((l) => l.status === "taken" || l.status === "late").length;
        return Math.round((taken / logList.length) * 100);
      };

      // Calculate streak - consecutive days with all doses taken
      const calculateStreak = (logList: typeof allLogs) => {
        if (logList.length === 0) return 0;
        
        // Group logs by date
        const logsByDate = new Map<string, typeof allLogs>();
        logList.forEach((log) => {
          const date = new Date(log.scheduled_time).toDateString();
          if (!logsByDate.has(date)) {
            logsByDate.set(date, []);
          }
          logsByDate.get(date)!.push(log);
        });

        let streak = 0;
        const today = new Date();
        
        for (let i = 0; i < 30; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() - i);
          const dateKey = checkDate.toDateString();
          
          const dayLogs = logsByDate.get(dateKey);
          if (!dayLogs || dayLogs.length === 0) {
            // No doses scheduled for this day, skip it
            continue;
          }
          
          const allTaken = dayLogs.every((l) => l.status === "taken" || l.status === "late");
          if (allTaken) {
            streak++;
          } else {
            break;
          }
        }
        
        return streak;
      };

      setStats({
        totalDoses: allLogs.length,
        takenDoses: allLogs.filter((l) => l.status === "taken").length,
        missedDoses: allLogs.filter((l) => l.status === "missed").length,
        lateDoses: allLogs.filter((l) => l.status === "late").length,
        skippedDoses: allLogs.filter((l) => l.status === "skipped").length,
        adherenceScore: calculateScore(allLogs),
        weeklyScore: calculateScore(weeklyLogs),
        monthlyScore: calculateScore(allLogs),
        streak: calculateStreak(weeklyLogs),
      });
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    calculateStats();
  }, [calculateStats]);

  return { stats, loading, refresh: calculateStats };
}
