import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { EmergencyCardView } from "@/components/EmergencyCardView";
import { useEmergencyProfile } from "@/hooks/useEmergencyProfile";
import { useMedications } from "@/hooks/useMedications";
import { Icons } from "@/components/icons";

export default function EmergencyCard() {
  const navigate = useNavigate();
  const { emergencyProfile, createDraft, saveProfile, saving, loading } = useEmergencyProfile();
  const { medications } = useMedications();
  const [form, setForm] = useState(createDraft());

  useEffect(() => {
    setForm(createDraft());
  }, [createDraft]);

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

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    const success = await saveProfile({
      ...form,
      blood_type: form.blood_type || null,
      allergies: form.allergies || null,
      conditions: form.conditions || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      doctor_name: form.doctor_name || null,
      doctor_phone: form.doctor_phone || null,
    });

    if (success) {
      navigate("/emergency-card/preview");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
              <Icons.chevronRight className="h-5 w-5 rotate-180" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Emergency Card Setup</h1>
              <p className="text-sm text-muted-foreground">Create the medical card responders can view fast.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container space-y-6 px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 p-5">
              <Icons.shield className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold text-foreground">Keep your most important medical details ready</p>
                <p className="text-sm text-muted-foreground">
                  Your active medications are pulled in automatically. Use commas to separate allergies and conditions.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card>
              <CardHeader>
                <CardTitle>Emergency Profile</CardTitle>
                <CardDescription>Fill in the information that should appear on your emergency card.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="card-name">Full Name</Label>
                  <Input
                    id="card-name"
                    value={form.name}
                    onChange={(event) => handleChange("name", event.target.value)}
                    placeholder="Your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="blood-type">Blood Type</Label>
                  <Input
                    id="blood-type"
                    value={form.blood_type || ""}
                    onChange={(event) => handleChange("blood_type", event.target.value.toUpperCase())}
                    placeholder="O+, A-, AB+"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allergies">Allergies</Label>
                  <Textarea
                    id="allergies"
                    value={form.allergies || ""}
                    onChange={(event) => handleChange("allergies", event.target.value)}
                    placeholder="Penicillin, peanuts, latex"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conditions">Medical Conditions</Label>
                  <Textarea
                    id="conditions"
                    value={form.conditions || ""}
                    onChange={(event) => handleChange("conditions", event.target.value)}
                    placeholder="Diabetes, asthma, hypertension"
                    rows={3}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">Emergency Contact Name</Label>
                    <Input
                      id="contact-name"
                      value={form.emergency_contact_name || ""}
                      onChange={(event) => handleChange("emergency_contact_name", event.target.value)}
                      placeholder="Family member or caregiver"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-phone">Emergency Contact Phone</Label>
                    <Input
                      id="contact-phone"
                      value={form.emergency_contact_phone || ""}
                      onChange={(event) => handleChange("emergency_contact_phone", event.target.value)}
                      placeholder="+1 555 123 4567"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="doctor-name">Doctor Name</Label>
                    <Input
                      id="doctor-name"
                      value={form.doctor_name || ""}
                      onChange={(event) => handleChange("doctor_name", event.target.value)}
                      placeholder="Primary doctor"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doctor-phone">Doctor Phone</Label>
                    <Input
                      id="doctor-phone"
                      value={form.doctor_phone || ""}
                      onChange={(event) => handleChange("doctor_phone", event.target.value)}
                      placeholder="+1 555 987 6543"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-accent/40 p-4">
                  <div>
                    <p className="font-semibold text-foreground">Card Active</p>
                    <p className="text-sm text-muted-foreground">
                      When inactive, the public link shows a disabled notice instead of your medical details.
                    </p>
                  </div>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) => handleChange("is_active", checked)}
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1">
                    {saving ? "Saving..." : emergencyProfile ? "Save Changes" : "Create Emergency Card"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/emergency-card/preview")}
                    disabled={loading}
                    className="flex-1"
                  >
                    Preview Card
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <EmergencyCardView
              profile={{
                name: form.name,
                blood_type: form.blood_type,
                allergies: form.allergies,
                conditions: form.conditions,
                emergency_contact_name: form.emergency_contact_name,
                emergency_contact_phone: form.emergency_contact_phone,
                doctor_name: form.doctor_name,
                doctor_phone: form.doctor_phone,
                is_active: form.is_active,
              }}
              medications={medicationSummaries}
            />
          </motion.div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
