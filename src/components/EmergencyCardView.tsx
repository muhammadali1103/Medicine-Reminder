import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { EmergencyMedicationSummary, EmergencyProfile } from "@/hooks/useEmergencyProfile";

interface EmergencyCardViewProps {
  profile: Pick<
    EmergencyProfile,
    | "name"
    | "blood_type"
    | "allergies"
    | "conditions"
    | "emergency_contact_name"
    | "emergency_contact_phone"
    | "doctor_name"
    | "doctor_phone"
    | "is_active"
  >;
  medications: EmergencyMedicationSummary[];
  className?: string;
  compact?: boolean;
}

function splitItems(value: string | null | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function phoneHref(phone: string | null | undefined) {
  if (!phone) {
    return undefined;
  }

  const normalized = phone.replace(/[^\d+]/g, "");
  return `tel:${normalized}`;
}

export function EmergencyCardView({
  profile,
  medications,
  className,
  compact = false,
}: EmergencyCardViewProps) {
  const allergies = splitItems(profile.allergies);
  const conditions = splitItems(profile.conditions);

  return (
    <Card className={cn("overflow-hidden border border-border/60 shadow-elevated", className)}>
      <div className="bg-gradient-primary px-5 py-6 text-primary-foreground">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/75">
              Emergency Medical Card
            </p>
            <h2 className="mt-2 text-2xl font-bold">{profile.name || "Unknown Patient"}</h2>
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-[0.22em] text-primary-foreground/75">Blood Type</p>
            <p className="mt-1 text-4xl font-black leading-none">{profile.blood_type || "--"}</p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 p-5">
        {!profile.is_active && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <Icons.alertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold text-foreground">Emergency card inactive</p>
                <p className="text-sm text-muted-foreground">
                  This card is currently disabled and should not be used for emergency reference.
                </p>
              </div>
            </div>
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Icons.alertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-sm font-semibold text-foreground">Allergies</p>
          </div>
          {allergies.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allergies.map((allergy) => (
                <Badge key={allergy} variant="destructive" className="text-xs">
                  {allergy}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No allergies listed.</p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Icons.shield className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Medical Conditions</p>
          </div>
          {conditions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {conditions.map((condition) => (
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No conditions listed.</p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-accent/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Emergency Contact
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {profile.emergency_contact_name || "Not provided"}
            </p>
            {profile.emergency_contact_phone ? (
              <a
                href={phoneHref(profile.emergency_contact_phone)}
                className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Icons.phone className="h-4 w-4" />
                {profile.emergency_contact_phone}
              </a>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No phone number added.</p>
            )}
          </div>

          <div className="rounded-2xl bg-accent/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Doctor
            </p>
            <p className="mt-2 font-semibold text-foreground">
              {profile.doctor_name || "Not provided"}
            </p>
            {profile.doctor_phone ? (
              <a
                href={phoneHref(profile.doctor_phone)}
                className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Icons.phone className="h-4 w-4" />
                {profile.doctor_phone}
              </a>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No phone number added.</p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icons.pill className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Current Medications</p>
            </div>
            <Badge variant="pill">{medications.length}</Badge>
          </div>

          {medications.length > 0 ? (
            <div className="space-y-2">
              {medications.map((medication) => (
                <div
                  key={medication.id}
                  className="rounded-2xl border border-border/60 bg-card px-4 py-3"
                >
                  <p className="font-semibold text-foreground">{medication.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[medication.strength, medication.dosage, medication.form]
                      .filter(Boolean)
                      .join(" • ") || "Medication details not available"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active medications found.</p>
          )}
        </section>

        {!compact && (
          <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-xs text-muted-foreground">
            Share this emergency card only with trusted caregivers, family members, and emergency responders.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
