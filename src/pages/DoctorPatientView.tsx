import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, FileText, HeartPulse, NotebookPen, Pill, Salad, Send, Plus, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HealthReportExport } from "@/components/HealthReportExport";
import { CaregiverHealthPanel } from "@/components/PatientHealthSection";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DoctorPatient {
  id: string;
  name: string;
  email: string;
  today_adherence: number;
}

interface AdherenceData {
  overall_percentage: number;
  per_medication: Array<{
    medication_id: string;
    name: string;
    dosage: string | null;
    taken: number;
    missed: number;
    percentage: number;
  }>;
}

interface NoteItem {
  id: string;
  note: string;
  is_read: boolean;
  created_at: string;
  doctor_name?: string | null;
}

interface DietMealForm {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  meal_name: string;
  description?: string;
  recommended_foods?: string;
  avoid_foods?: string;
  calories?: number | null;
  meal_time?: string;
}

export default function DoctorPatientView() {
  const { patientId = "" } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<DoctorPatient | null>(null);
  const [adherence, setAdherence] = useState<AdherenceData | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [dietPlan, setDietPlan] = useState<any | null>(null);
  const [editingDiet, setEditingDiet] = useState(false);
  const [dietForm, setDietForm] = useState({
    title: "",
    start_date: "",
    end_date: "",
    notes: "",
    meals: [{ meal_type: "breakfast", meal_name: "", recommended_foods: "", avoid_foods: "", calories: null, meal_time: "" }] as DietMealForm[],
  });

  const fetchAll = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [patientsResponse, adherenceResponse, notesResponse, dietResponse] = await Promise.all([
        apiClient.request<{ data: DoctorPatient[] | null; error: any }>("/doctor/patients"),
        apiClient.request<{ data: AdherenceData | null; error: any }>(`/doctor/patient/${patientId}/adherence`),
        apiClient.request<{ data: NoteItem[] | null; error: any }>(`/doctor/patient/${patientId}/notes`),
        apiClient.request<{ data: any | null; error: any }>(`/diet/plan/active?patientId=${encodeURIComponent(patientId)}`),
      ]);

      setPatient((patientsResponse.data || []).find((item) => item.id === patientId) || null);
      setAdherence(adherenceResponse.data || null);
      setNotes(notesResponse.data || []);
      setDietPlan(dietResponse.data || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, [patientId]);

  useEffect(() => {
    if (!dietPlan) {
      setDietForm({
        title: "",
        start_date: "",
        end_date: "",
        notes: "",
        meals: [{ meal_type: "breakfast", meal_name: "", recommended_foods: "", avoid_foods: "", calories: null, meal_time: "" }],
      });
      return;
    }

    setDietForm({
      title: dietPlan.title || "",
      start_date: dietPlan.start_date || "",
      end_date: dietPlan.end_date || "",
      notes: dietPlan.notes || "",
      meals: dietPlan.meals?.length
        ? dietPlan.meals.map((meal: any) => ({
            meal_type: meal.meal_type,
            meal_name: meal.meal_name,
            description: meal.description || "",
            recommended_foods: meal.recommended_foods || "",
            avoid_foods: meal.avoid_foods || "",
            calories: meal.calories ?? null,
            meal_time: meal.meal_time || "",
          }))
        : [{ meal_type: "breakfast", meal_name: "", recommended_foods: "", avoid_foods: "", calories: null, meal_time: "" }],
    });
  }, [dietPlan]);

  const sendNote = async () => {
    if (!noteDraft.trim()) {
      return toast.error("Write a note first.");
    }

    setSavingNote(true);
    const response = await apiClient.request<{ data: { success: boolean } | null; error: { message?: string } | null }>(
      "/doctor/notes",
      {
        method: "POST",
        body: JSON.stringify({ patientId, note: noteDraft }),
      }
    );
    setSavingNote(false);

    if (response.error) {
      return toast.error(response.error.message || "Unable to send note.");
    }

    toast.success("Note sent to patient.");
    setNoteDraft("");
    await fetchAll();
  };

  const saveDiet = async () => {
    const method = dietPlan?.id ? "PUT" : "POST";
    const path = dietPlan?.id
      ? `/doctor/patient/${patientId}/diet/${dietPlan.id}`
      : `/doctor/patient/${patientId}/diet`;

    const response = await apiClient.request<{ data: { success?: boolean } | null; error: { message?: string } | null }>(path, {
      method,
      body: JSON.stringify({
        title: dietForm.title,
        start_date: dietForm.start_date || null,
        end_date: dietForm.end_date || null,
        notes: dietForm.notes,
        meals: dietForm.meals,
      }),
    });

    if (response.error) {
      return toast.error(response.error.message || "Unable to save diet plan.");
    }

    toast.success("Diet plan saved.");
    setEditingDiet(false);
    await fetchAll();
  };

  const overallAdherence = adherence?.overall_percentage || 0;

  return (
    <div className="min-h-screen bg-gradient-hero pb-10">
      <header className="bg-gradient-primary px-4 pb-10 pt-8 text-primary-foreground">
        <div className="container">
          <Button variant="ghost" className="mb-4 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" onClick={() => navigate("/doctor")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Doctor Portal
          </Button>
          <h1 className="text-2xl font-bold">{patient?.name || "Patient Detail"}</h1>
          <p className="text-sm text-primary-foreground/80">{patient?.email || "Loading patient..."}</p>
        </div>
      </header>

      <main className="container -mt-6 px-4">
        <Tabs defaultValue="vitals" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 rounded-2xl">
            <TabsTrigger value="vitals">Vitals</TabsTrigger>
            <TabsTrigger value="medications">Medications</TabsTrigger>
            <TabsTrigger value="diet">Diet</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="report">Report</TabsTrigger>
          </TabsList>

          <TabsContent value="vitals">
            <CaregiverHealthPanel patientName={patient?.name || "Patient"} patientId={patientId} canManageGoals />
          </TabsContent>

          <TabsContent value="medications" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="h-4 w-4 text-primary" />
                  Medication Adherence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Overall Adherence</p>
                      <p className="text-xs text-muted-foreground">Last 30 days</p>
                    </div>
                    <Badge variant={overallAdherence >= 80 ? "success" : overallAdherence >= 60 ? "warning" : "destructive"}>
                      {overallAdherence}%
                    </Badge>
                  </div>
                  <Progress className="mt-3 h-2.5" value={overallAdherence} />
                </div>

                {(adherence?.per_medication || []).map((item) => (
                  <div key={item.medication_id} className="rounded-2xl border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.dosage || "Dose not specified"}</p>
                      </div>
                      <Badge variant={item.percentage >= 80 ? "success" : item.percentage >= 60 ? "warning" : "destructive"}>
                        {item.percentage}%
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Taken {item.taken} • Missed {item.missed}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="diet" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Salad className="h-4 w-4 text-primary" />
                  Diet Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={() => setEditingDiet((prev) => !prev)}>
                    {editingDiet ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                    {editingDiet ? "Close Editor" : dietPlan ? "Edit Plan" : "Add New Plan"}
                  </Button>
                </div>

                {dietPlan && !editingDiet && (
                  <div className="rounded-2xl border border-border/60 p-4">
                    <p className="font-semibold text-foreground">{dietPlan.title}</p>
                    {dietPlan.doctor_name && (
                      <Badge variant="status" className="mt-2">Recommended by Dr. {dietPlan.doctor_name}</Badge>
                    )}
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {(dietPlan.meals || []).map((meal: any) => (
                        <div key={`${meal.meal_type}-${meal.id || meal.meal_name}`} className="rounded-2xl bg-muted/40 p-3">
                          <p className="font-medium text-foreground">{meal.meal_type}</p>
                          <p className="text-sm text-muted-foreground">{meal.meal_name}</p>
                          {meal.recommended_foods && <p className="mt-1 text-sm text-emerald-700">Eat: {meal.recommended_foods}</p>}
                          {meal.avoid_foods && <p className="text-sm text-red-700">Avoid: {meal.avoid_foods}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {editingDiet && (
                  <div className="space-y-4 rounded-2xl border border-primary/15 bg-background p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Plan Title</Label>
                        <Input value={dietForm.title} onChange={(e) => setDietForm((prev) => ({ ...prev, title: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Input value={dietForm.notes} onChange={(e) => setDietForm((prev) => ({ ...prev, notes: e.target.value }))} />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={dietForm.start_date} onChange={(e) => setDietForm((prev) => ({ ...prev, start_date: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={dietForm.end_date} onChange={(e) => setDietForm((prev) => ({ ...prev, end_date: e.target.value }))} />
                      </div>
                    </div>

                    {dietForm.meals.map((meal, index) => (
                      <div key={`${meal.meal_type}-${index}`} className="space-y-3 rounded-2xl border border-border/60 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Meal Type</Label>
                            <Select value={meal.meal_type} onValueChange={(value: any) => setDietForm((prev) => ({ ...prev, meals: prev.meals.map((item, itemIndex) => itemIndex === index ? { ...item, meal_type: value } : item) }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="breakfast">Breakfast</SelectItem>
                                <SelectItem value="lunch">Lunch</SelectItem>
                                <SelectItem value="dinner">Dinner</SelectItem>
                                <SelectItem value="snack">Snack</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Meal Name</Label>
                            <Input value={meal.meal_name} onChange={(e) => setDietForm((prev) => ({ ...prev, meals: prev.meals.map((item, itemIndex) => itemIndex === index ? { ...item, meal_name: e.target.value } : item) }))} />
                          </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Recommended Foods</Label>
                            <Input value={meal.recommended_foods || ""} onChange={(e) => setDietForm((prev) => ({ ...prev, meals: prev.meals.map((item, itemIndex) => itemIndex === index ? { ...item, recommended_foods: e.target.value } : item) }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>Foods to Avoid</Label>
                            <Input value={meal.avoid_foods || ""} onChange={(e) => setDietForm((prev) => ({ ...prev, meals: prev.meals.map((item, itemIndex) => itemIndex === index ? { ...item, avoid_foods: e.target.value } : item) }))} />
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setDietForm((prev) => ({ ...prev, meals: [...prev.meals, { meal_type: "breakfast", meal_name: "", recommended_foods: "", avoid_foods: "", calories: null, meal_time: "" }] }))}>
                        Add Meal
                      </Button>
                      <Button onClick={saveDiet}>Save Diet Plan</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-primary" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Write guidance, observations, or follow-up instructions for the patient"
                />
                <Button onClick={sendNote} disabled={savingNote}>
                  <Send className="mr-2 h-4 w-4" />
                  {savingNote ? "Sending..." : "Send Note"}
                </Button>

                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-2xl border border-border/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{note.doctor_name || "Doctor Note"}</p>
                        <div className="flex items-center gap-2">
                          {!note.is_read && <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                          <span className="text-xs text-muted-foreground">{format(new Date(note.created_at), "MMM d, yyyy h:mm a")}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{note.note}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Full Health Report
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate the same medical-style PDF report available to the patient, including medications, vitals, sugar, diet, and doctor's notes page.
                </p>
                <HealthReportExport
                  patientId={patientId}
                  patientName={patient?.name}
                  variant="button"
                  buttonLabel="Generate PDF Report"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
