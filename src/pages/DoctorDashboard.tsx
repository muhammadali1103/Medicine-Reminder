import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/apiClient";
import { HealthReportExport } from "@/components/HealthReportExport";
import { toast } from "sonner";
import { Stethoscope, UserPlus, Activity, Droplets, FileText } from "lucide-react";

interface DoctorPatient {
  id: string;
  name: string;
  email: string;
  today_adherence: number;
  latest_vitals: {
    systolic?: number | null;
    diastolic?: number | null;
    blood_sugar?: number | null;
  } | null;
  last_seen: string | null;
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [doctorProfile, setDoctorProfile] = useState<{ full_name?: string | null; specialization?: string | null; hospital?: string | null } | null>(null);
  const [patientEmail, setPatientEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [patientsResponse, profileResponse] = await Promise.all([
        apiClient.request<{ data: DoctorPatient[] | null; error: { message?: string } | null }>("/doctor/patients"),
        apiClient.request<{ data: { full_name?: string | null; specialization?: string | null; hospital?: string | null } | null; error: { message?: string } | null }>("/doctor/profile"),
      ]);

      if (patientsResponse.error) {
        toast.error(patientsResponse.error.message || "Failed to load patients.");
      } else {
        setPatients(patientsResponse.data || []);
      }

      if (!profileResponse.error) {
        setDoctorProfile(profileResponse.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [user]);

  const invitePatient = async () => {
    if (!patientEmail.trim()) {
      toast.error("Enter a patient email first.");
      return;
    }

    setInviting(true);
    const response = await apiClient.request<{ data: { invite_link?: string } | null; error: { message?: string } | null }>(
      "/doctor/invite",
      {
        method: "POST",
        body: JSON.stringify({ patientEmail: patientEmail.trim() }),
      }
    );
    setInviting(false);

    if (response.error) {
      toast.error(response.error.message || "Unable to send doctor invite.");
      return;
    }

    toast.success("Doctor invite created. The patient can accept it from their dashboard or invite link.");
    setPatientEmail("");
    await fetchData();
  };

  const doctorName = useMemo(
    () => doctorProfile?.full_name?.split(" ")[0] || user?.user_metadata?.full_name?.split(" ")[0] || "Doctor",
    [doctorProfile?.full_name, user?.user_metadata?.full_name]
  );

  return (
    <div className="min-h-screen bg-gradient-hero pb-12">
      <header className="bg-gradient-primary px-4 pb-10 pt-8 text-primary-foreground">
        <div className="container">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 p-3">
              <Stethoscope className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Dr. {doctorName}</h1>
              <p className="text-sm text-primary-foreground/80">
                {doctorProfile?.specialization || "Doctor Portal"} {doctorProfile?.hospital ? `• ${doctorProfile.hospital}` : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container -mt-6 px-4 space-y-6">
        <Card className="border-primary/15">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Add Patient
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>Patient Email</Label>
              <Input
                value={patientEmail}
                onChange={(event) => setPatientEmail(event.target.value)}
                placeholder="patient@example.com"
              />
            </div>
            <Button className="md:self-end" onClick={invitePatient} disabled={inviting}>
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Active Patients</p>
              <p className="mt-2 text-3xl font-bold text-foreground">{patients.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Reports Ready</p>
              <p className="mt-2 text-3xl font-bold text-foreground">{patients.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Needs Attention</p>
              <p className="mt-2 text-3xl font-bold text-foreground">{patients.filter((patient) => patient.today_adherence < 70).length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">My Patients</h2>
          </div>

          {loading ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Loading patients...</CardContent></Card>
          ) : patients.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No linked patients yet. Send an invite to get started.</CardContent></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {patients.map((patient, index) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="overflow-hidden border-border/70">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">{patient.name}</h3>
                          <p className="text-sm text-muted-foreground">{patient.email}</p>
                        </div>
                        <Badge variant={patient.today_adherence >= 80 ? "success" : patient.today_adherence >= 60 ? "warning" : "destructive"}>
                          {patient.today_adherence}% today
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-muted/40 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">BP</p>
                          <p className="mt-1 font-semibold text-foreground">
                            {patient.latest_vitals?.systolic && patient.latest_vitals?.diastolic
                              ? `${patient.latest_vitals.systolic}/${patient.latest_vitals.diastolic}`
                              : "-"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-muted/40 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sugar</p>
                          <p className="mt-1 font-semibold text-foreground">
                            {patient.latest_vitals?.blood_sugar ?? "-"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-muted/40 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last Seen</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {patient.last_seen ? formatDistanceToNow(new Date(patient.last_seen), { addSuffix: true }) : "No activity"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => navigate(`/doctor/patient/${patient.id}`)}>
                          <Activity className="mr-2 h-4 w-4" />
                          Open Patient
                        </Button>
                        <HealthReportExport
                          variant="button"
                          patientId={patient.id}
                          patientName={patient.name}
                          buttonLabel="Generate PDF"
                          className="w-auto"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
