import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { AdherenceRing } from "@/components/AdherenceRing";
import { HealthReportExport } from "@/components/HealthReportExport";
import { CaregiverHealthPanel } from "@/components/PatientHealthSection";
import { useAuth } from "@/hooks/useAuth";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { useUserRole } from "@/hooks/useUserRole";
import { apiClient } from "@/lib/apiClient";
import { formatDistanceToNow } from "date-fns";
import {
  Users,
  Pill,
  Clock,
  Eye,
  Search,
  Heart,
  Check,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface PatientData {
  id: string;
  name: string;
  adherenceScore: number;
  medicationCount: number;
  lastActivity: Date | null;
  recentDoses: {
    taken: number;
    missed: number;
    pending: number;
  };
  medications: Array<{
    name: string;
    dosage: string;
    schedule: string;
  }>;
  status: "excellent" | "good" | "needs-attention" | "critical";
}

export default function CaregiverPatients() {
  const { user } = useAuth();
  const { links, loading: linksLoading, acceptLink, rejectLink } = useCaregiverLinks();
  const { role } = useUserRole();
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);

  const pendingInvitations = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "pending"),
    [links, user]
  );

  const activePatientLinks = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "active"),
    [links, user]
  );

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!user || activePatientLinks.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const patientData: PatientData[] = [];

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
            .select("status, scheduled_time")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const taken = doseLogs?.filter((l) => l.status === "taken" || l.status === "late").length || 0;
          const missed = doseLogs?.filter((l) => l.status === "missed").length || 0;
          const pending = doseLogs?.filter((l) => l.status === "pending").length || 0;
          const total = doseLogs?.length || 0;
          const adherenceScore = total > 0 ? Math.round((taken / total) * 100) : 100;

          let status: PatientData["status"] = "excellent";
          if (adherenceScore < 50) status = "critical";
          else if (adherenceScore < 70) status = "needs-attention";
          else if (adherenceScore < 90) status = "good";

          const { data: lastLog } = await apiClient
            .from("dose_logs")
            .select("scheduled_time")
            .eq("user_id", link.patient_id)
            .order("scheduled_time", { ascending: false })
            .limit(1)
            .single();

          const medications = (meds || []).map((med) => {
            const schedule = med.schedule as { times?: string[]; frequency?: string } | null;
            return {
              name: med.name,
              dosage: med.dosage || "1 tablet",
              schedule: schedule?.times?.join(", ") || "As needed",
            };
          });

          patientData.push({
            id: link.patient_id,
            name: link.patient_profile?.full_name || "Patient",
            adherenceScore,
            medicationCount: meds?.length || 0,
            lastActivity: lastLog ? new Date(lastLog.scheduled_time) : null,
            recentDoses: { taken, missed, pending },
            medications,
            status,
          });
        } catch (err) {
          console.error("Error fetching patient data:", err);
        }
      }

      setPatients(patientData);
      setLoading(false);
    };

    fetchPatientData();
  }, [user, activePatientLinks.length]);

  const getStatusColor = (status: PatientData["status"]) => {
    switch (status) {
      case "excellent": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "good": return "bg-primary/10 text-primary border-primary/20";
      case "needs-attention": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "critical": return "bg-red-500/10 text-red-600 border-red-500/20";
    }
  };

  const getStatusLabel = (status: PatientData["status"]) => {
    switch (status) {
      case "excellent": return "Excellent";
      case "good": return "Good";
      case "needs-attention": return "Needs Attention";
      case "critical": return "Critical";
    }
  };

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-safe px-4 py-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6" />
          My Patients
        </h1>
        <p className="text-white/80 text-sm mt-1">
          {patients.length} patient{patients.length !== 1 ? "s" : ""} under your care
        </p>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-primary">
                  <Heart className="w-5 h-5" />
                  Pending Invitations ({pendingInvitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvitations.map((invitation) => (
                  <motion.div
                    key={invitation.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center justify-between p-3 bg-card rounded-xl border border-primary/15"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {(invitation.patient_profile?.full_name || "P").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {invitation.patient_profile?.full_name || "Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Invited {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        disabled={processingInvite === invitation.id}
                        onClick={async () => {
                          setProcessingInvite(invitation.id);
                          await rejectLink(invitation.id);
                          setProcessingInvite(null);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-gradient-primary text-primary-foreground hover:brightness-110"
                        disabled={processingInvite === invitation.id}
                        onClick={async () => {
                          setProcessingInvite(invitation.id);
                          await acceptLink(invitation.id);
                          setProcessingInvite(null);
                        }}
                      >
                        {processingInvite === invitation.id ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Accept
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search patients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading || linksLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Loading patients...</p>
            </CardContent>
          </Card>
        ) : filteredPatients.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">
                {searchQuery ? "No patients found" : "No Patients Yet"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "When patients invite you, they'll appear here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="h-[calc(100vh-280px)] overflow-y-auto">
            <div className="space-y-4 pr-2">
              {filteredPatients.map((patient, index) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center">
                            <span className="text-lg font-bold text-white">
                              {patient.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-foreground">{patient.name}</h3>
                              <Badge className={getStatusColor(patient.status)}>
                                {getStatusLabel(patient.status)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Pill className="w-3 h-3" />
                                {patient.medicationCount} meds
                              </span>
                              {patient.lastActivity && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDistanceToNow(patient.lastActivity, { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mt-4">
                          <div className="text-center p-2">
                            <AdherenceRing percentage={patient.adherenceScore} size={40} strokeWidth={4} showLabel={false} />
                          </div>
                          <div className="text-center p-2 rounded-lg bg-emerald-500/10">
                            <p className="text-lg font-bold text-emerald-600">{patient.recentDoses.taken}</p>
                            <p className="text-xs text-muted-foreground">Taken</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-red-500/10">
                            <p className="text-lg font-bold text-red-600">{patient.recentDoses.missed}</p>
                            <p className="text-xs text-muted-foreground">Missed</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-slate-500/10">
                            <p className="text-lg font-bold text-slate-600">{patient.recentDoses.pending}</p>
                            <p className="text-xs text-muted-foreground">Pending</p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border p-3 bg-muted/20 flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedPatient(patient)}>
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>
                        <HealthReportExport
                          variant="button"
                          patientId={patient.id}
                          patientName={patient.name}
                          buttonLabel="Report"
                          className="flex-1 bg-gradient-primary text-primary-foreground hover:brightness-110"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {selectedPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setSelectedPatient(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="flex w-full max-w-lg flex-col rounded-t-3xl bg-background max-h-[85vh] overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-4 border-b border-border">
                <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-foreground">{selectedPatient.name}</h2>
                  <Badge className={getStatusColor(selectedPatient.status)}>
                    {getStatusLabel(selectedPatient.status)}
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="p-4 min-h-0">
                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2 rounded-2xl">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="health">Health</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <Card>
                        <CardContent className="p-4">
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            Weekly Adherence
                          </h3>
                          <div className="flex items-center gap-4">
                            <AdherenceRing percentage={selectedPatient.adherenceScore} size={80} strokeWidth={8} />
                            <div className="flex-1 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Taken</span>
                                <span className="font-medium text-emerald-600">{selectedPatient.recentDoses.taken}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Missed</span>
                                <span className="font-medium text-red-600">{selectedPatient.recentDoses.missed}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Pending</span>
                                <span className="font-medium text-slate-600">{selectedPatient.recentDoses.pending}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Pill className="w-4 h-4 text-primary" />
                            Medications ({selectedPatient.medications.length})
                          </h3>
                          <div className="space-y-3">
                            {selectedPatient.medications.map((medication, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                                <div>
                                  <p className="font-medium text-foreground">{medication.name}</p>
                                  <p className="text-xs text-muted-foreground">{medication.dosage}</p>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {medication.schedule}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="health">
                      <CaregiverHealthPanel patientName={selectedPatient.name} patientId={selectedPatient.id} canManageGoals={role === "doctor"} />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>

              <div className="border-t border-border p-4">
                <HealthReportExport
                  variant="button"
                  patientId={selectedPatient.id}
                  patientName={selectedPatient.name}
                  buttonLabel="Download Full Health Report"
                  className="w-full bg-gradient-primary text-primary-foreground hover:brightness-110"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CaregiverBottomNav />
    </div>
  );
}
