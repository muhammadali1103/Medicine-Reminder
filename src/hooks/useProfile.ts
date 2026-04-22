import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  consent_notifications: boolean;
  consent_data_sharing: boolean;
  timezone: string | null;
}

export interface ProfileStats {
  medicationCount: number;
  adherenceStreak: number;
  adherenceScore: number;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    medicationCount: 0,
    adherenceStreak: 0,
    adherenceScore: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await apiClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching profile:", error);
      }

      setProfile(data);
    } catch (err) {
      console.error("Unexpected error:", err);
    }
  }, [user]);

  const fetchStats = useCallback(async () => {
    if (!user) return;

    try {
      // Get medication count
      const { count: medCount } = await apiClient
        .from("medications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);

      // Get dose logs for streak calculation
      const { data: logs } = await apiClient
        .from("dose_logs")
        .select("scheduled_time, status")
        .eq("user_id", user.id)
        .order("scheduled_time", { ascending: false });

      // Calculate streak (consecutive days with all doses taken)
      let streak = 0;
      if (logs && logs.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Group logs by date
        const logsByDate = new Map<string, { taken: number; total: number }>();
        logs.forEach((log) => {
          const date = new Date(log.scheduled_time).toDateString();
          const existing = logsByDate.get(date) || { taken: 0, total: 0 };
          existing.total++;
          if (log.status === "taken" || log.status === "late") {
            existing.taken++;
          }
          logsByDate.set(date, existing);
        });

        // Count consecutive days with 100% adherence
        for (let i = 0; i < 365; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() - i);
          const dateStr = checkDate.toDateString();
          const dayLogs = logsByDate.get(dateStr);

          if (!dayLogs || dayLogs.total === 0) {
            if (i === 0) continue; // Skip today if no logs yet
            break;
          }

          if (dayLogs.taken === dayLogs.total) {
            streak++;
          } else {
            break;
          }
        }
      }

      // Calculate adherence score (last 30 days)
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const recentLogs = logs?.filter(
        (log) => new Date(log.scheduled_time) >= monthAgo
      ) || [];

      const adherenceScore =
        recentLogs.length > 0
          ? Math.round(
              (recentLogs.filter(
                (l) => l.status === "taken" || l.status === "late"
              ).length /
                recentLogs.length) *
                100
            )
          : 0;

      setStats({
        medicationCount: medCount || 0,
        adherenceStreak: streak,
        adherenceScore,
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, [user]);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user) return false;

      try {
        const { error } = await apiClient
          .from("profiles")
          .update(updates)
          .eq("id", user.id);

        if (error) {
          console.error("Error updating profile:", error);
          toast.error("Failed to update profile");
          return false;
        }

        setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
        toast.success("Profile updated");
        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        toast.error("An error occurred");
        return false;
      }
    },
    [user]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchStats()]);
      setLoading(false);
    };
    load();
  }, [fetchProfile, fetchStats]);

  return {
    profile,
    stats,
    loading,
    updateProfile,
    refresh: () => Promise.all([fetchProfile(), fetchStats()]),
  };
}
