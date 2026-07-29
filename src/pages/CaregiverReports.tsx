import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Activity, Calendar, FileText, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { HealthReportExport } from "@/components/HealthReportExport";
import { useAuth } from "@/hooks/useAuth";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { apiClient } from "@/lib/apiClient";

interface PatientReport {
  id: string;
  name: string;
  adherenceScore: number;
  medicationCount: number;
}

export default function CaregiverReports() {
  const { user } = useAuth();
  const { links, loading: linksLoading } = useCaregiverLinks();
  const [patients, setPatients] = useState<PatientReport[]>([]);
  const [loading, setLoading] = useState(true);

  const activePatientLinks = links.filter((link) => link.caregiver_id === user?.id && link.status === "active");

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!user || activePatientLinks.length === 0) {
        setPatients([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const nextPatients: PatientReport[] = [];

      for (const link of activePatientLinks) {
        try {
          const { data: meds } = await apiClient
            .from("medications")
            .select("*")
            .eq("user_id", link.patient_id)
            .eq("is_active", true);

          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const { data: doseLogs } = await apiClient
            .from("dose_logs")
            .select("status")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const taken = doseLogs?.filter((entry) => entry.status === "taken" || entry.status === "late").length || 0;
          const total = doseLogs?.length || 0;

          nextPatients.push({
            id: link.patient_id,
            name: link.patient_profile?.full_name || "Patient",
            adherenceScore: total > 0 ? Math.round((taken / total) * 100) : 100,
            medicationCount: meds?.length || 0,
          });
        } catch (error) {
          console.error("Error fetching caregiver reports data:", error);
        }
      }

      setPatients(nextPatients);
      setLoading(false);
    };

    fetchPatientData();
  }, [activePatientLinks, user]);

  const avgAdherence = patients.length > 0
    ? Math.round(patients.reduce((sum, patient) => sum + patient.adherenceScore, 0) / patients.length)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-safe px-4 py-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Patient Reports
        </h1>
        <p className="text-white/80 text-sm mt-1">Download complete health reports for your patients</p>
      </header>

      <main className="px-4 py-4 space-y-4">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent border-primary/20">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Users className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{patients.length}</p>
                <p className="text-xs text-muted-foreground">Patients</p>
              </div>
              <div>
                <Activity className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{avgAdherence}%</p>
                <p className="text-xs text-muted-foreground">Avg Adherence</p>
              </div>
              <div>
                <Calendar className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{format(new Date(), "MMM d")}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading || linksLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Loading reports...</p>
            </CardContent>
          </Card>
        ) : patients.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">No Reports Available</h3>
              <p className="text-sm text-muted-foreground">You need active patients to generate reports.</p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-3 pr-2">
              {patients.map((patient, index) => (
                <motion.div key={patient.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                            <span className="text-sm font-bold text-white">{patient.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{patient.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{patient.medicationCount} meds</span>
                              <span>•</span>
                              <span className={patient.adherenceScore >= 80 ? "text-emerald-600" : patient.adherenceScore >= 50 ? "text-amber-600" : "text-red-600"}>
                                {patient.adherenceScore}% adherence
                              </span>
                            </div>
                          </div>
                        </div>
                        <HealthReportExport
                          variant="button"
                          patientId={patient.id}
                          patientName={patient.name}
                          buttonLabel="Download"
                          className="border-primary/30 text-primary hover:bg-accent"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        )}
      </main>

      <CaregiverBottomNav />
    </div>
  );
}
