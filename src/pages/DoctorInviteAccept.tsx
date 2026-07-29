import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";

export default function DoctorInviteAccept() {
  const { token = "" } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const accept = async () => {
      const response = await apiClient.request<{ data: { success: boolean } | null; error: { message?: string } | null }>(
        `/doctor/accept/${token}`
      );

      if (response.error) {
        toast.error(response.error.message || "Unable to accept doctor invite.");
      } else {
        toast.success("Doctor invite accepted.");
      }

      navigate("/");
    };

    if (token) {
      void accept();
    }
  }, [navigate, token]);

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4">
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Accepting doctor invitation...
        </CardContent>
      </Card>
    </div>
  );
}
