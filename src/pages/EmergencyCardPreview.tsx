import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BottomNav } from "@/components/BottomNav";
import { EmergencyCardView } from "@/components/EmergencyCardView";
import { useEmergencyProfile } from "@/hooks/useEmergencyProfile";
import { useMedications } from "@/hooks/useMedications";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function EmergencyCardPreview() {
  const navigate = useNavigate();
  const qrWrapperRef = useRef<HTMLDivElement | null>(null);
  const { isOnline } = useOnlineStatus();
  const { emergencyProfile, loading } = useEmergencyProfile();
  const { medications } = useMedications();

  const publicUrl = useMemo(() => {
    if (!emergencyProfile || typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}/emergency-card/${emergencyProfile.card_id}`;
  }, [emergencyProfile]);

  const medicationSummaries = useMemo(
    () =>
      medications.map((medication) => ({
        id: medication.id,
        name: medication.name,
        strength: medication.strength,
        dosage: medication.dosage,
        form: medication.form,
      })),
    [medications]
  );

  const handleCopyLink = async () => {
    if (!publicUrl) {
      return;
    }

    if (!isOnline) {
      toast.error("Emergency card sharing requires internet connection.");
      return;
    }

    await navigator.clipboard.writeText(publicUrl);
    toast.success("Emergency card link copied");
  };

  const handleDownloadQr = () => {
    const canvas = qrWrapperRef.current?.querySelector("canvas");
    if (!canvas || !emergencyProfile) {
      return;
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `emergency-card-${emergencyProfile.card_id}.png`;
    link.click();
    toast.success("QR code downloaded");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero pb-24">
        <main className="container flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading emergency card...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!emergencyProfile) {
    return (
      <div className="min-h-screen bg-gradient-hero pb-24">
        <main className="container flex min-h-screen items-center justify-center px-4">
          <Card className="max-w-lg">
            <CardContent className="p-6 text-center">
              <Icons.fileText className="mx-auto h-10 w-10 text-primary" />
              <h1 className="mt-4 text-xl font-bold text-foreground">No emergency card yet</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your emergency profile first so you can preview and share it.
              </p>
              <Button className="mt-5" onClick={() => navigate("/emergency-card")}>
                Set Up Emergency Card
              </Button>
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate("/emergency-card")}>
              <Icons.chevronRight className="h-5 w-5 rotate-180" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Emergency Card Preview</h1>
              <p className="text-sm text-muted-foreground">Print it, share it, or keep the QR code ready.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container grid gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <EmergencyCardView profile={emergencyProfile} medications={medicationSummaries} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader>
              <CardTitle>Share & Access</CardTitle>
              <CardDescription>
                Anyone with this link or QR code can open the card when it is active.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div
                ref={qrWrapperRef}
                className="flex flex-col items-center rounded-2xl border border-border/60 bg-card p-5"
              >
                <QRCodeCanvas
                  value={publicUrl}
                  size={220}
                  includeMargin
                  className="rounded-2xl bg-white p-3"
                />
                <p className="mt-4 break-all text-center text-xs text-muted-foreground">{publicUrl}</p>
              </div>

              {!emergencyProfile.is_active && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-muted-foreground">
                  This card is inactive. The public page will show a disabled message until you switch it back on.
                </div>
              )}

              {!isOnline && (
                <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-muted-foreground">
                  Emergency card sharing requires internet. You can still preview this card offline.
                </div>
              )}

              <div className="grid gap-3">
                <Button onClick={handleCopyLink}>
                  <Icons.copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button>
                <Button variant="outline" onClick={handleDownloadQr}>
                  <Icons.download className="mr-2 h-4 w-4" />
                  Download QR as PNG
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Icons.fileText className="mr-2 h-4 w-4" />
                  Print Card
                </Button>
                <Button variant="ghost" onClick={() => navigate("/emergency-card")}>
                  Edit Emergency Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
