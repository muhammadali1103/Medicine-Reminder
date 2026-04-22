import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CaregiverLink {
  id: string;
  caregiver_id: string;
  patient_id: string;
  status: "pending" | "active" | "rejected";
  permissions: {
    view_adherence: boolean;
    receive_alerts: boolean;
    modify_medications: boolean;
  };
  created_at: string;
  caregiver_profile?: {
    full_name: string | null;
  };
  patient_profile?: {
    full_name: string | null;
  };
}

export function useCaregiverLinks() {
  const { user } = useAuth();
  const [links, setLinks] = useState<CaregiverLink[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLinks = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Get links where user is patient
      const { data: patientLinks, error: patientError } = await apiClient
        .from("caregiver_links")
        .select("*")
        .eq("patient_id", user.id);

      // Get links where user is caregiver
      const { data: caregiverLinks, error: caregiverError } = await apiClient
        .from("caregiver_links")
        .select("*")
        .eq("caregiver_id", user.id);

      if (patientError || caregiverError) {
        console.error("Error fetching caregiver links:", patientError || caregiverError);
        setLoading(false);
        return;
      }

      const allLinks = [...(patientLinks || []), ...(caregiverLinks || [])];

      // Fetch profile names for each link
      const enrichedLinks = await Promise.all(
        allLinks.map(async (link) => {
          const [caregiverProfile, patientProfile] = await Promise.all([
            apiClient
              .from("profiles")
              .select("full_name")
              .eq("id", link.caregiver_id)
              .single(),
            apiClient
              .from("profiles")
              .select("full_name")
              .eq("id", link.patient_id)
              .single(),
          ]);

          return {
            ...link,
            permissions: link.permissions as CaregiverLink["permissions"],
            status: link.status as CaregiverLink["status"],
            caregiver_profile: caregiverProfile.data,
            patient_profile: patientProfile.data,
          };
        })
      );

      setLinks(enrichedLinks);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const inviteCaregiver = useCallback(
    async (caregiverEmail: string, relationship?: string) => {
      if (!user) {
        toast.error("Please sign in");
        return false;
      }

      try {
        // Get patient name from profile
        const { data: profile } = await apiClient
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        const patientName = profile?.full_name || "A patient";

        // Call the invite-caregiver edge function
        const { data, error } = await apiClient.functions.invoke("invite-caregiver", {
          body: {
            caregiverEmail,
            patientId: user.id,
            patientName,
            relationship,
          },
        });

        if (error) {
          console.error("Error inviting caregiver:", error);
          toast.error("Failed to send invitation");
          return false;
        }

        if (data?.error) {
          toast.error(data.error);
          return false;
        }

        if (data?.pendingEmail) {
          toast.success("Invitation email sent! They'll need to create an account first.");
        } else {
          toast.success("Invitation sent successfully! They'll see it in their app.");
        }

        await fetchLinks();
        return true;
      } catch (err) {
        console.error("Error inviting caregiver:", err);
        toast.error("Failed to send invitation");
        return false;
      }
    },
    [user, fetchLinks]
  );

  const acceptLink = useCallback(
    async (linkId: string) => {
      if (!user) return false;

      try {
        const { data, error } = await apiClient
          .from("caregiver_links")
          .update({ status: "active" })
          .eq("id", linkId)
          .eq("caregiver_id", user.id)
          .select();

        if (error) {
          console.error("Error accepting link:", error);
          toast.error("Failed to accept invitation");
          return false;
        }

        // Check if update actually affected rows
        if (!data || data.length === 0) {
          console.error("No rows updated - RLS may be blocking");
          toast.error("Failed to accept invitation");
          return false;
        }

        toast.success("Caregiver link accepted!");
        await fetchLinks();
        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        return false;
      }
    },
    [user, fetchLinks]
  );

  const rejectLink = useCallback(
    async (linkId: string) => {
      if (!user) return false;

      try {
        const { data, error } = await apiClient
          .from("caregiver_links")
          .update({ status: "rejected" })
          .eq("id", linkId)
          .eq("caregiver_id", user.id)
          .select();

        if (error) {
          console.error("Error rejecting link:", error);
          toast.error("Failed to reject invitation");
          return false;
        }

        // Check if update actually affected rows
        if (!data || data.length === 0) {
          console.error("No rows updated - RLS may be blocking");
          toast.error("Failed to reject invitation");
          return false;
        }

        toast.success("Invitation rejected");
        await fetchLinks();
        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        return false;
      }
    },
    [user, fetchLinks]
  );

  const removeLink = useCallback(
    async (linkId: string) => {
      if (!user) return false;

      try {
        const { error } = await apiClient
          .from("caregiver_links")
          .delete()
          .eq("id", linkId);

        if (error) {
          console.error("Error removing link:", error);
          toast.error("Failed to remove caregiver");
          return false;
        }

        toast.success("Caregiver removed");
        await fetchLinks();
        return true;
      } catch (err) {
        console.error("Unexpected error:", err);
        return false;
      }
    },
    [user, fetchLinks]
  );

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return {
    links,
    loading,
    inviteCaregiver,
    acceptLink,
    rejectLink,
    removeLink,
    refresh: fetchLinks,
  };
}
