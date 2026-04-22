import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

export interface EmergencyProfile {
  id: string;
  user_id: string;
  name: string;
  blood_type: string | null;
  allergies: string | null;
  conditions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  card_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EmergencyMedicationSummary {
  id: string;
  name: string;
  strength?: string | null;
  dosage?: string | null;
  form?: string | null;
}

type EmergencyProfileInput = Omit<EmergencyProfile, "id" | "user_id" | "card_id"> & {
  card_id?: string;
};

function makeCardId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useEmergencyProfile() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [emergencyProfile, setEmergencyProfile] = useState<EmergencyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setEmergencyProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await apiClient
        .from("emergency_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error?.code === "PGRST116") {
        setEmergencyProfile(null);
        return;
      }

      if (error) {
        console.error("Error loading emergency profile:", error);
        toast.error("Failed to load emergency card");
        return;
      }

      setEmergencyProfile(data as EmergencyProfile);
    } catch (error) {
      console.error("Unexpected error loading emergency profile:", error);
      toast.error("Failed to load emergency card");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveProfile = useCallback(
    async (input: EmergencyProfileInput) => {
      if (!user) {
        return false;
      }

      setSaving(true);
      try {
        if (emergencyProfile) {
          const { error } = await apiClient
            .from("emergency_profiles")
            .update({
              ...input,
              updated_at: new Date().toISOString(),
            })
            .eq("id", emergencyProfile.id);

          if (error) {
            console.error("Error updating emergency profile:", error);
            toast.error("Failed to update emergency card");
            return false;
          }

          setEmergencyProfile({
            ...emergencyProfile,
            ...input,
          });
        } else {
          const cardId = input.card_id || makeCardId();
          const payload = {
            ...input,
            user_id: user.id,
            card_id: cardId,
          };

          const { data, error } = await apiClient
            .from("emergency_profiles")
            .insert(payload)
            .select("*")
            .single();

          if (error) {
            console.error("Error creating emergency profile:", error);
            toast.error("Failed to create emergency card");
            return false;
          }

          setEmergencyProfile(data as EmergencyProfile);
        }

        toast.success("Emergency card saved");
        return true;
      } catch (error) {
        console.error("Unexpected error saving emergency profile:", error);
        toast.error("Failed to save emergency card");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [emergencyProfile, user]
  );

  const createDraft = useCallback((): EmergencyProfileInput => {
    return {
      name: emergencyProfile?.name || profile?.full_name || user?.user_metadata?.full_name || "",
      blood_type: emergencyProfile?.blood_type || "",
      allergies: emergencyProfile?.allergies || "",
      conditions: emergencyProfile?.conditions || "",
      emergency_contact_name: emergencyProfile?.emergency_contact_name || "",
      emergency_contact_phone: emergencyProfile?.emergency_contact_phone || "",
      doctor_name: emergencyProfile?.doctor_name || "",
      doctor_phone: emergencyProfile?.doctor_phone || "",
      is_active: emergencyProfile?.is_active ?? true,
      card_id: emergencyProfile?.card_id || makeCardId(),
    };
  }, [emergencyProfile, profile?.full_name, user?.user_metadata?.full_name]);

  return {
    emergencyProfile,
    loading,
    saving,
    refresh,
    saveProfile,
    createDraft,
  };
}
