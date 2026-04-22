import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cacheKey, formatLastSynced, readCachedData, writeCachedData } from "@/services/offlineCache";
import { enqueueSyncAction } from "@/services/syncQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// Use Json type for schedule since it comes from apiClient
type ScheduleData = { type?: string; times?: string[]; frequency?: string } | null;

export interface MedicationData {
  id: string;
  user_id: string;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  dosage: string | null;
  form: string;
  color: string | null;
  shape: string | null;
  imprint: string | null;
  schedule: { type?: string; times?: string[]; frequency?: string } | null;
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  refill_reminder: boolean;
  pills_remaining: number | null;
  is_active: boolean;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface InteractionWarning {
  medication1: string;
  medication2: string;
  riskLevel: "low" | "medium" | "high";
  interactionType: string;
  description: string;
  recommendation: string;
}

export function useMedications() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [medications, setMedications] = useState<MedicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchMedications = useCallback(async () => {
    // Wait for auth to complete before deciding
    if (authLoading) return;
    
    if (!user) {
      setMedications([]);
      setLoading(false);
      return;
    }

    const key = cacheKey(user.id, "medications");
    const cached = readCachedData<MedicationData[]>(key);
    if (cached) {
      setMedications(cached.data);
      setLastSyncedAt(cached.savedAt);
      setLoading(false);
    }

    if (!isOnline) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await apiClient
        .from("medications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching medications:", error);
        toast.error("Failed to load medications");
        setMedications([]);
        return;
      }

      // Cast data to MedicationData[] since schedule type from DB is Json
      const normalized = (data || []) as unknown as MedicationData[];
      setMedications(normalized);
      writeCachedData(key, normalized);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      console.error("Unexpected error:", err);
      if (!cached) {
        setMedications([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, isOnline]);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const deleteMedication = useCallback(
    async (id: string) => {
      if (!user) return false;

      try {
        const { error } = await apiClient.from("medications").delete().eq("id", id);

        if (error) {
          console.error("Error deleting medication:", error);
          toast.error("Failed to delete medication");
          return false;
        }

        setMedications((prev) => prev.filter((m) => m.id !== id));
        toast.success("Medication deleted");
        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        toast.error("An error occurred");
        return false;
      }
    },
    [isOnline, user]
  );

  const updateMedication = useCallback(
    async (id: string, updates: Partial<MedicationData>) => {
      if (!user) return false;

      if (!isOnline) {
        setMedications((prev) => {
          const next = prev.map((m) => (m.id === id ? { ...m, ...updates } : m));
          writeCachedData(cacheKey(user.id, "medications"), next);
          return next;
        });
        enqueueSyncAction("UPDATE_MEDICATION", { id, updates });
        toast.info("Medication update saved offline. It will sync when you're back online.");
        return true;
      }

      try {
        const { error } = await apiClient
          .from("medications")
          .update(updates)
          .eq("id", id);

        if (error) {
          console.error("Error updating medication:", error);
          toast.error("Failed to update medication");
          return false;
        }

        setMedications((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
        );
        toast.success("Medication updated");
        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        toast.error("An error occurred");
        return false;
      }
    },
    [user]
  );

  const toggleMedicationStatus = useCallback(
    async (id: string) => {
      const med = medications.find((m) => m.id === id);
      if (!med) return false;

      return updateMedication(id, { is_active: !med.is_active });
    },
    [medications, updateMedication]
  );

  const checkInteractions = useCallback(
    async (newMedication: Partial<MedicationData>) => {
      if (!user || medications.length === 0) return [];

      try {
        const activeMeds = medications.filter((m) => m.is_active && m.id !== newMedication.id);

        const { data, error } = await apiClient.functions.invoke("check-interactions", {
          body: {
            newMedication: {
              name: newMedication.name,
              generic_name: newMedication.generic_name,
              strength: newMedication.strength,
            },
            existingMedications: activeMeds.map((m) => ({
              id: m.id,
              name: m.name,
              generic_name: m.generic_name,
              strength: m.strength,
            })),
          },
        });

        if (error) {
          console.error("Error checking interactions:", error);
          return [];
        }

        if (!data.success) {
          console.error("Interaction check failed:", data.error);
          return [];
        }

        return data.interactions as InteractionWarning[];
      } catch (err) {
        console.error("Unexpected error:", err);
        return [];
      }
    },
    [user, medications]
  );

  const saveInteractionWarnings = useCallback(
    async (medicationId: string, warnings: InteractionWarning[]) => {
      if (!user || warnings.length === 0) return;

      try {
        const warningsToInsert = warnings.map((w) => ({
          user_id: user.id,
          medication_ids: [medicationId],
          interaction_type: w.interactionType,
          risk_level: w.riskLevel,
          description: `${w.medication1} + ${w.medication2}: ${w.description}`,
          recommendation: w.recommendation,
          acknowledged: false,
        }));

        const { error } = await apiClient.from("interaction_warnings").insert(warningsToInsert);

        if (error) {
          console.error("Error saving interaction warnings:", error);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
      }
    },
    [user]
  );

  return {
    medications,
    loading,
    lastSyncedAt,
    lastSyncedLabel: formatLastSynced(lastSyncedAt),
    refresh: fetchMedications,
    deleteMedication,
    updateMedication,
    toggleMedicationStatus,
    checkInteractions,
    saveInteractionWarnings,
  };
}
