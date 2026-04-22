import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { EmergencyCardView } from "@/components/EmergencyCardView";
import { apiClient } from "@/lib/apiClient";
import { Icons } from "@/components/icons";

interface PublicEmergencyCardData {
  name?: string;
  blood_type?: string | null;
  allergies?: string | null;
  conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  doctor_name?: string | null;
  doctor_phone?: string | null;
  is_active: boolean;
  medications: Array<{
    id: string;
    name: string;
    strength?: string | null;
    dosage?: string | null;
    form?: string | null;
  }>;
}

export default function PublicEmergencyCard() {
  const { card_id } = useParams();
  const [card, setCard] = useState<PublicEmergencyCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadCard = async () => {
      if (!card_id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data, error } = await apiClient.public.getEmergencyCard(card_id);
      if (error) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCard(data);
      setLoading(false);
    };

    void loadCard();
  }, [card_id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero">
        <main className="container flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading emergency card...</p>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !card) {
    return (
      <div className="min-h-screen bg-gradient-hero">
        <main className="container flex min-h-screen items-center justify-center px-4">
          <Card className="max-w-lg">
            <CardContent className="p-6 text-center">
              <Icons.alertTriangle className="mx-auto h-10 w-10 text-warning" />
              <h1 className="mt-4 text-xl font-bold text-foreground">Emergency card unavailable</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This emergency card link is invalid or no longer available.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!card.is_active) {
    return (
      <div className="min-h-screen bg-gradient-hero">
        <main className="container flex min-h-screen items-center justify-center px-4">
          <Card className="max-w-lg border-destructive/30 bg-destructive/10">
            <CardContent className="p-6 text-center">
              <Icons.shield className="mx-auto h-10 w-10 text-destructive" />
              <h1 className="mt-4 text-xl font-bold text-foreground">Emergency card disabled</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This card is currently inactive and the medical details are not being shared publicly.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      <main className="container max-w-3xl px-4 py-8">
        <EmergencyCardView
          profile={{
            name: card.name || "Unknown Patient",
            blood_type: card.blood_type || null,
            allergies: card.allergies || null,
            conditions: card.conditions || null,
            emergency_contact_name: card.emergency_contact_name || null,
            emergency_contact_phone: card.emergency_contact_phone || null,
            doctor_name: card.doctor_name || null,
            doctor_phone: card.doctor_phone || null,
            is_active: true,
          }}
          medications={card.medications || []}
          className="mx-auto"
        />
      </main>
    </div>
  );
}
