import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Activity,
  Apple,
  Calendar,
  Clock,
  HeartPulse,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DietMeal, DietPlan, MealType, useDietPlans, useHealthSummary, useVitals } from "@/hooks/useHealth";

function statusBadgeClass(status?: string | null) {
  switch (status) {
    case "Normal":
    case "Logged":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    case "Elevated":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    case "Low":
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
    case "High":
      return "bg-red-500/10 text-red-700 border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function metricValueClass(status?: string | null) {
  return status === "High" || status === "Low" ? "text-red-600" : "text-foreground";
}

function mealTypeLabel(mealType: MealType) {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

function mealTypeIcon(mealType: MealType) {
  switch (mealType) {
    case "breakfast":
      return "🌅";
    case "lunch":
      return "☀️";
    case "dinner":
      return "🌙";
    case "snack":
      return "🍎";
  }
}

function HealthMetricBadge({ label, status }: { label: string; status?: string | null }) {
  if (!status) return null;
  return <Badge className={cn("border", statusBadgeClass(status))}>{label} {status}</Badge>;
}

export function HealthSummaryWidget({ onOpenVitals, onOpenDiet }: { onOpenVitals: () => void; onOpenDiet: () => void }) {
  const { summary, loading } = useHealthSummary();

  if (loading || !summary) {
    return null;
  }

  const bpText = summary.vitals?.systolic && summary.vitals?.diastolic
    ? `${summary.vitals.systolic}/${summary.vitals.diastolic}`
    : "Not logged";
  const sugarText = summary.vitals?.blood_sugar != null ? `${summary.vitals.blood_sugar} mg/dL` : "Not logged";

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-background to-accent/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Health Summary</p>
            <h3 className="text-lg font-bold text-foreground">Today at a glance</h3>
          </div>
          <div className="rounded-2xl bg-primary/10 p-2">
            <Activity className="h-5 w-5 text-primary" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={onOpenVitals}
            className="rounded-2xl border border-border/60 bg-background/70 p-4 text-left transition hover:border-primary/30 hover:shadow-sm"
          >
            <p className="text-sm font-semibold text-foreground">Today's Vitals</p>
            <p className="mt-1 text-sm text-muted-foreground">
              BP {bpText} {summary.vitals?.bp_status ? `• ${summary.vitals.bp_status}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Sugar {sugarText} {summary.vitals?.sugar_status ? `• ${summary.vitals.sugar_status}` : ""}
            </p>
          </button>

          <button
            type="button"
            onClick={onOpenDiet}
            className="rounded-2xl border border-border/60 bg-background/70 p-4 text-left transition hover:border-primary/30 hover:shadow-sm"
          >
            <p className="text-sm font-semibold text-foreground">Diet Today</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.diet_today.followed}/{summary.diet_today.planned || summary.diet_today.logged} meals followed
            </p>
            <p className="text-sm text-muted-foreground">
              {summary.active_plan ? `Plan: ${summary.active_plan.title}` : "No active plan yet"}
            </p>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PatientVitalsTab() {
  const { latest, entries, chartData, loading, logVitals, deleteEntry } = useVitals();
  const [form, setForm] = useState({
    systolic: "",
    diastolic: "",
    bloodSugar: "",
    heartRate: "",
    weight: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const todayEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const today = new Date().toDateString();
        return new Date(entry.logged_at).toDateString() === today;
      }),
    [entries]
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    const data = await logVitals({
      systolic: form.systolic ? Number(form.systolic) : null,
      diastolic: form.diastolic ? Number(form.diastolic) : null,
      bloodSugar: form.bloodSugar ? Number(form.bloodSugar) : null,
      heartRate: form.heartRate ? Number(form.heartRate) : null,
      weight: form.weight ? Number(form.weight) : null,
      notes: form.notes,
    });
    setSubmitting(false);

    if (!data) {
      return;
    }

    setForm({
      systolic: "",
      diastolic: "",
      bloodSugar: "",
      heartRate: "",
      weight: "",
      notes: "",
    });

    data.alerts?.forEach((alert) => {
      toast.error(alert.message, {
        duration: 7000,
      });
    });
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartPulse className="h-5 w-5 text-primary" />
            Quick Log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2 rounded-2xl border border-border/70 p-3">
              <Label>Blood Pressure</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="120" value={form.systolic} onChange={(e) => setForm((prev) => ({ ...prev, systolic: e.target.value }))} />
                <span className="text-muted-foreground">/</span>
                <Input placeholder="80" value={form.diastolic} onChange={(e) => setForm((prev) => ({ ...prev, diastolic: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 p-3">
              <Label>Blood Sugar</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="110" value={form.bloodSugar} onChange={(e) => setForm((prev) => ({ ...prev, bloodSugar: e.target.value }))} />
                <span className="text-sm text-muted-foreground">mg/dL</span>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 p-3">
              <Label>Heart Rate</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="74" value={form.heartRate} onChange={(e) => setForm((prev) => ({ ...prev, heartRate: e.target.value }))} />
                <span className="text-sm text-muted-foreground">bpm</span>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 p-3">
              <Label>Weight</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="68" value={form.weight} onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))} />
                <span className="text-sm text-muted-foreground">kg</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Textarea
              placeholder="Optional notes"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <Button onClick={handleSubmit} disabled={submitting} className="md:self-end">
              <Save className="mr-2 h-4 w-4" />
              {submitting ? "Saving..." : "Log Now"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <HealthMetricBadge label="BP" status={latest?.bp_status} />
            {latest?.sugar_status === "High" && <Badge className="border border-red-500/20 bg-red-500/10 text-red-700">{">180 mg/dL High"}</Badge>}
            {latest?.sugar_status === "Low" && <Badge className="border border-yellow-500/20 bg-yellow-500/10 text-yellow-700">{"<70 mg/dL Low"}</Badge>}
            <HealthMetricBadge label="Sugar" status={latest?.sugar_status} />
          </div>

          {todayEntries.length > 0 && (
            <div className="rounded-2xl bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">Today's entries</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {todayEntries.map((entry) => (
                  <Badge key={entry.id} variant="secondary" className="rounded-full px-3 py-1">
                    {format(new Date(entry.logged_at), "h:mm a")} •
                    {entry.systolic && entry.diastolic ? ` BP ${entry.systolic}/${entry.diastolic}` : ""}
                    {entry.blood_sugar != null ? ` • Sugar ${entry.blood_sugar}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Blood Pressure Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), "MMM d")} />
                <YAxis />
                <Tooltip labelFormatter={(value) => format(new Date(value), "MMM d")} />
                <ReferenceArea y1={60} y2={120} fill="rgba(34,197,94,0.08)" />
                <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="diastolic" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Blood Sugar Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), "MMM d")} />
                <YAxis />
                <Tooltip labelFormatter={(value) => format(new Date(value), "MMM d")} />
                <ReferenceArea y1={0} y2={70} fill="rgba(245,158,11,0.1)" />
                <ReferenceArea y1={180} y2={400} fill="rgba(239,68,68,0.08)" />
                <Line type="monotone" dataKey="bloodSugar" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Heart Rate Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChartWrapper data={chartData} />
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-[140px_120px_120px_120px_120px_1fr_90px] gap-3 border-b border-border/60 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Date</span>
                <span>BP</span>
                <span>Sugar</span>
                <span>Heart Rate</span>
                <span>Weight</span>
                <span>Notes</span>
                <span>Action</span>
              </div>
              <div className="space-y-2 pt-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[140px_120px_120px_120px_120px_1fr_90px] items-center gap-3 rounded-2xl border border-border/60 px-3 py-3 text-sm">
                    <span className="text-muted-foreground">{format(new Date(entry.logged_at), "MMM d, h:mm a")}</span>
                    <span className={metricValueClass(entry.bp_status)}>
                      {entry.systolic && entry.diastolic ? `${entry.systolic}/${entry.diastolic}` : "-"}
                    </span>
                    <span className={metricValueClass(entry.sugar_status)}>{entry.blood_sugar ?? "-"}</span>
                    <span className={metricValueClass(entry.heart_rate_status)}>{entry.heart_rate ?? "-"}</span>
                    <span>{entry.weight ?? "-"}</span>
                    <span className="text-muted-foreground">{entry.notes || "-"}</span>
                    <Button variant="ghost" size="sm" onClick={() => deleteEntry(entry.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {!loading && entries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-muted-foreground">
                    No vitals logged yet.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function AreaChartWrapper({ data }: { data: Array<{ date: string; heartRate: number | null }> }) {
  return (
    <AreaChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), "MMM d")} />
      <YAxis />
      <Tooltip labelFormatter={(value) => format(new Date(value), "MMM d")} />
      <Area type="monotone" dataKey="heartRate" stroke="#8b5cf6" fill="rgba(139,92,246,0.12)" strokeWidth={2} />
    </AreaChart>
  );
}

function getInitialMeal(): DietMeal {
  return {
    meal_type: "breakfast",
    meal_name: "",
    description: "",
    recommended_foods: "",
    avoid_foods: "",
    calories: null,
    meal_time: "",
  };
}

function DietPlanEditor({
  open,
  onOpenChange,
  activePlan,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePlan: DietPlan | null;
  onSave: (payload: {
    id?: string;
    title: string;
    created_by: "patient" | "doctor";
    doctor_name?: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
    meals: DietMeal[];
  }) => Promise<boolean>;
}) {
  const [form, setForm] = useState({
    id: "",
    title: "",
    created_by: "patient" as "patient" | "doctor",
    doctor_name: "",
    start_date: "",
    end_date: "",
    notes: "",
    meals: [getInitialMeal()],
  });

  useEffect(() => {
    if (!open) return;

    if (activePlan) {
      setForm({
        id: activePlan.id,
        title: activePlan.title,
        created_by: activePlan.created_by,
        doctor_name: activePlan.doctor_name || "",
        start_date: activePlan.start_date || "",
        end_date: activePlan.end_date || "",
        notes: activePlan.notes || "",
        meals: activePlan.meals.length > 0 ? activePlan.meals : [getInitialMeal()],
      });
    } else {
      setForm({
        id: "",
        title: "",
        created_by: "patient",
        doctor_name: "",
        start_date: "",
        end_date: "",
        notes: "",
        meals: [getInitialMeal()],
      });
    }
  }, [activePlan, open]);

  const updateMeal = (index: number, patch: Partial<DietMeal>) => {
    setForm((prev) => ({
      ...prev,
      meals: prev.meals.map((meal, mealIndex) => (mealIndex === index ? { ...meal, ...patch } : meal)),
    }));
  };

  const save = async () => {
    const success = await onSave({
      id: form.id || undefined,
      title: form.title,
      created_by: form.created_by,
      doctor_name: form.doctor_name,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes,
      meals: form.meals,
    });

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{activePlan ? "Edit Diet Plan" : "Create Diet Plan"}</SheetTitle>
          <SheetDescription>Build a daily food plan with recommended and avoid lists.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-6 h-[calc(90vh-180px)] pr-4">
          <div className="space-y-4 pb-6">
            <div className="space-y-2">
              <Label>Plan Title</Label>
              <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Diabetes friendly weekly plan" />
            </div>

            <div className="space-y-2">
              <Label>Created by</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={form.created_by === "patient" ? "default" : "outline"} onClick={() => setForm((prev) => ({ ...prev, created_by: "patient" }))}>
                  Myself
                </Button>
                <Button type="button" variant={form.created_by === "doctor" ? "default" : "outline"} onClick={() => setForm((prev) => ({ ...prev, created_by: "doctor" }))}>
                  Doctor Recommended
                </Button>
              </div>
            </div>

            {form.created_by === "doctor" && (
              <div className="space-y-2">
                <Label>Doctor Name</Label>
                <Input value={form.doctor_name} onChange={(e) => setForm((prev) => ({ ...prev, doctor_name: e.target.value }))} placeholder="Dr. Ahmed" />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Extra guidance for the week" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Meals</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm((prev) => ({ ...prev, meals: [...prev.meals, getInitialMeal()] }))}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Another Meal
                </Button>
              </div>

              {form.meals.map((meal, index) => (
                <Card key={`${meal.meal_type}-${index}`} className="border-border/70">
                  <CardContent className="space-y-3 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Meal Type</Label>
                        <Select value={meal.meal_type} onValueChange={(value: MealType) => updateMeal(index, { meal_type: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="breakfast">Breakfast</SelectItem>
                            <SelectItem value="lunch">Lunch</SelectItem>
                            <SelectItem value="dinner">Dinner</SelectItem>
                            <SelectItem value="snack">Snack</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Meal Time</Label>
                        <Input value={meal.meal_time || ""} onChange={(e) => updateMeal(index, { meal_time: e.target.value })} placeholder="8:00 AM" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Meal Name</Label>
                      <Input value={meal.meal_name} onChange={(e) => updateMeal(index, { meal_name: e.target.value })} placeholder="Oatmeal with berries" />
                    </div>

                    <div className="space-y-2">
                      <Label>Recommended Foods</Label>
                      <Input value={meal.recommended_foods || ""} onChange={(e) => updateMeal(index, { recommended_foods: e.target.value })} placeholder="Oats, banana, milk" />
                    </div>

                    <div className="space-y-2">
                      <Label>Foods to Avoid</Label>
                      <Input value={meal.avoid_foods || ""} onChange={(e) => updateMeal(index, { avoid_foods: e.target.value })} placeholder="Sugar, fried items" />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Calories</Label>
                        <Input value={meal.calories ?? ""} onChange={(e) => updateMeal(index, { calories: e.target.value ? Number(e.target.value) : null })} placeholder="250" />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={meal.description || ""} onChange={(e) => updateMeal(index, { description: e.target.value })} placeholder="Keep portions balanced" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </ScrollArea>

        <Button onClick={save} className="mt-4 w-full">
          <Save className="mr-2 h-4 w-4" />
          Save Plan
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export function PatientDietTab() {
  const { activePlan, history, loading, savePlan, deactivatePlan, logMeal } = useDietPlans();
  const [editorOpen, setEditorOpen] = useState(false);

  const weeklyMessage = history?.weekly_adherence?.percentage
    ? `Great job! You followed ${history.weekly_adherence.percentage}% of your diet this week`
    : "Start logging meals to see your weekly diet streak.";

  return (
    <div className="space-y-4">
      <Card className="border-primary/15 bg-gradient-to-br from-background via-background to-primary/5">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Active Plan</p>
              <h3 className="text-xl font-bold text-foreground">{activePlan?.title || "No diet plan yet"}</h3>
              {activePlan?.created_by === "doctor" && activePlan.doctor_name && (
                <Badge className="mt-2 border border-primary/20 bg-primary/10 text-primary">
                  👨‍⚕️ Recommended by Dr. {activePlan.doctor_name}
                </Badge>
              )}
              {activePlan && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {activePlan.start_date || "Now"} → {activePlan.end_date || "Open ended"}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                {activePlan ? "Edit" : "Create"}
              </Button>
              {activePlan && (
                <Button variant="ghost" onClick={() => deactivatePlan(activePlan.id)}>
                  Archive
                </Button>
              )}
            </div>
          </div>

          {activePlan?.notes && (
            <div className="rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">{activePlan.notes}</div>
          )}
        </CardContent>
      </Card>

      {activePlan ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {activePlan.meals.map((meal) => (
            <Card key={`${meal.meal_type}-${meal.id || meal.meal_name}`} className="overflow-hidden border-border/70">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {mealTypeIcon(meal.meal_type)} {mealTypeLabel(meal.meal_type)}
                    </p>
                    <h4 className="mt-1 text-lg font-semibold text-foreground">{meal.meal_name}</h4>
                  </div>
                  {meal.meal_time && (
                    <Badge variant="secondary" className="rounded-full">
                      <Clock className="mr-1 h-3 w-3" />
                      {meal.meal_time}
                    </Badge>
                  )}
                </div>

                {meal.description && <p className="text-sm text-muted-foreground">{meal.description}</p>}
                {meal.recommended_foods && <p className="text-sm text-emerald-700">✅ Eat: {meal.recommended_foods}</p>}
                {meal.avoid_foods && <p className="text-sm text-red-700">❌ Avoid: {meal.avoid_foods}</p>}
                {meal.calories != null && <p className="text-sm text-muted-foreground">Calories: {meal.calories}</p>}

                <Button
                  className="w-full"
                  onClick={() =>
                    logMeal({
                      diet_plan_id: activePlan.id,
                      meal_type: meal.meal_type,
                      meal_name: meal.meal_name,
                      followed_plan: true,
                    })
                  }
                >
                  Mark as followed
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Apple className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold text-foreground">Build your first diet plan</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add meals, recommended foods, and avoid lists for each part of the day.</p>
            <Button className="mt-4" onClick={() => setEditorOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Diet Plan
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Diet Adherence Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">{weeklyMessage}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Weekly adherence: {history?.weekly_adherence?.followed || 0}/{history?.weekly_adherence?.total || 0} meals
            </p>
          </div>

          <div className="space-y-3">
            {(history?.weekly_adherence?.by_meal_type || []).map((item) => (
              <div key={item.meal_type} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{mealTypeLabel(item.meal_type)}</span>
                  <span className="text-muted-foreground">{item.percentage}%</span>
                </div>
                <Progress value={item.percentage} className="h-2" />
              </div>
            ))}
          </div>

          {!!history?.entries?.length && (
            <div className="space-y-2 rounded-2xl border border-border/60 p-4">
              <p className="text-sm font-semibold text-foreground">Recent meal logs</p>
              {history.entries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {mealTypeLabel(entry.meal_type)} • {entry.meal_name || "Meal"}
                  </span>
                  <Badge className={entry.followed_plan ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>
                    {entry.followed_plan ? "Followed" : "Logged"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DietPlanEditor open={editorOpen} onOpenChange={setEditorOpen} activePlan={activePlan} onSave={savePlan} />
    </div>
  );
}

export function CaregiverHealthPanel({ patientName, patientId }: { patientName: string; patientId: string }) {
  const { latest, chartData } = useVitals(patientId);
  const { activePlan, history } = useDietPlans(patientId);
  const criticalMessage =
    latest?.systolic && latest.systolic > 160
      ? `${patientName} has high blood pressure reading today`
      : latest?.blood_sugar && (latest.blood_sugar > 300 || latest.blood_sugar < 70)
        ? `${patientName} has a critical blood sugar reading today`
        : null;

  return (
    <div className="space-y-4">
      {criticalMessage && (
        <Card className="border-red-500/20 bg-red-500/10">
          <CardContent className="flex items-center gap-3 p-4 text-red-700">
            <ShieldAlert className="h-5 w-5" />
            <p className="font-medium">{criticalMessage}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Latest Vitals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <MetricTile title="Blood Pressure" value={latest?.systolic && latest?.diastolic ? `${latest.systolic}/${latest.diastolic}` : "-"} status={latest?.bp_status} />
          <MetricTile title="Blood Sugar" value={latest?.blood_sugar != null ? `${latest.blood_sugar}` : "-"} status={latest?.sugar_status} />
          <MetricTile title="Heart Rate" value={latest?.heart_rate != null ? `${latest.heart_rate} bpm` : "-"} status={latest?.heart_rate_status} />
          <MetricTile title="Weight" value={latest?.weight != null ? `${latest.weight} kg` : "-"} status={latest?.weight_status} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">BP Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), "MMM d")} />
                <YAxis />
                <Tooltip labelFormatter={(value) => format(new Date(value), "MMM d")} />
                <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="diastolic" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Blood Sugar Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), "MMM d")} />
                <YAxis />
                <Tooltip labelFormatter={(value) => format(new Date(value), "MMM d")} />
                <Line type="monotone" dataKey="bloodSugar" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Diet Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activePlan ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{activePlan.title}</p>
                  {activePlan.created_by === "doctor" && activePlan.doctor_name && (
                    <Badge className="mt-2 border border-primary/20 bg-primary/10 text-primary">Recommended by Dr. {activePlan.doctor_name}</Badge>
                  )}
                </div>
                <Badge variant="secondary">
                  <Calendar className="mr-1 h-3 w-3" />
                  {activePlan.start_date || "Now"}
                </Badge>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {activePlan.meals.map((meal) => (
                  <div key={`${meal.meal_type}-${meal.id || meal.meal_name}`} className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm font-semibold text-primary">
                      {mealTypeIcon(meal.meal_type)} {mealTypeLabel(meal.meal_type)}
                    </p>
                    <p className="mt-1 font-medium text-foreground">{meal.meal_name}</p>
                    {meal.recommended_foods && <p className="mt-2 text-sm text-emerald-700">✅ {meal.recommended_foods}</p>}
                    {meal.avoid_foods && <p className="text-sm text-red-700">❌ {meal.avoid_foods}</p>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No active diet plan for this patient yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Diet Adherence This Week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {history?.weekly_adherence?.percentage || 0}% of planned meals were followed this week.
          </p>
          {(history?.weekly_adherence?.by_meal_type || []).map((item) => (
            <div key={item.meal_type} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{mealTypeLabel(item.meal_type)}</span>
                <span className={item.percentage < 50 ? "text-red-600" : "text-muted-foreground"}>{item.percentage}%</span>
              </div>
              <Progress value={item.percentage} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({ title, value, status }: { title: string; value: string; status?: string | null }) {
  return (
    <div className="rounded-2xl border border-border/60 p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className={cn("mt-1 text-lg font-bold", metricValueClass(status))}>{value}</p>
      <div className="mt-2">
        <HealthMetricBadge label="" status={status} />
      </div>
    </div>
  );
}
