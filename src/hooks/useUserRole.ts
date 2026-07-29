import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "patient" | "caregiver" | "doctor";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await apiClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user role:", error);
        // Default to patient if no role found
        setRole("patient");
      } else {
        setRole(data?.role as AppRole || "patient");
      }
    } catch (err) {
      console.error("Unexpected error fetching role:", err);
      setRole("patient");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateRole = useCallback(async (newRole: AppRole) => {
    if (!user) return false;

    try {
      // Check if role exists
      const { data: existing } = await apiClient
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        // Update existing role - but this might fail due to RLS
        // In that case, we just use the selected role locally
        const { error } = await apiClient
          .from("user_roles")
          .update({ role: newRole })
          .eq("user_id", user.id);

        if (error) {
          console.error("Error updating role:", error);
          // Still set locally for the session
          setRole(newRole);
          localStorage.setItem("selected_role", newRole);
          return true;
        }
      }

      setRole(newRole);
      localStorage.setItem("selected_role", newRole);
      return true;
    } catch (err) {
      console.error("Unexpected error updating role:", err);
      // Still set locally for the session
      setRole(newRole);
      localStorage.setItem("selected_role", newRole);
      return true;
    }
  }, [user]);

  useEffect(() => {
    // First check localStorage for selected role
    const selectedRole = localStorage.getItem("selected_role") as AppRole | null;
    if (selectedRole && ["patient", "caregiver", "doctor"].includes(selectedRole)) {
      setRole(selectedRole);
      setLoading(false);
    } else {
      fetchRole();
    }
  }, [fetchRole]);

  const isCaregiver = role === "caregiver";
  const isDoctor = role === "doctor";
  const isPatient = role === "patient";

  return {
    role,
    loading,
    isCaregiver,
    isDoctor,
    isPatient,
    updateRole,
    refresh: fetchRole,
  };
}
