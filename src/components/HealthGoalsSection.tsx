import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trophy, Target, HeartPulse, Droplets, Weight, Activity, Pencil, Trash2, Share2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GoalDirection, HealthGoal, HealthGoalType, useHealthGoals } from "@/hooks/useHealth";
import { toast } from "sonner";

const goalTypeOptions: Array<{
  value: HealthGoalType;
  label: string;
  icon: string;
  directionOptions?: GoalDirection[];
}> = [
  { value: "bp_systolic", label: "Blood Pressure Systolic", icon: "🫀" },
  { value: "bp_diastolic", label: "Blood Pressure Diastolic", icon: "🫀" },
  { value: "blood_sugar", label: "Blood Sugar", icon: "🩸" },
  { value: "weight", label: "Weight", icon: "⚖️" },
  { value: "heart_rate", label: "Heart Rate", icon: "💓" },
  { value: "medication_adherence", label: "Medication Adherence %", icon: "💊" },
  { value: "diet_adherence", label: "Diet Adherence %", icon: "🥗" },
  { value: "water_intake", label: "Water Intake", icon: "💧" },
];

function goalIcon(goalType: HealthGoalType) {
  switch (goalType) {
    case "bp_systolic":
    case "bp_diastolic":
      return HeartPulse;
    case "blood_sugar":
      return Droplets;
    case "weight":
      return Weight;
    case "heart_rate":
      return Activity;
    default:
      return Target;
  }
}

function goalTone(goal: HealthGoal) {
  if (goal.is_achieved || goal.status === "achieved") {
    return {
      badge: "success" as const,
      ring: "stroke-emerald-500",
      text: "text-emerald-700",
      label: "Achieved",
    };
  }

  if (goal.progress_percentage >= 80) {
    return {
      badge: "status" as const,
      ring: "stroke-primary",
      text: "text-primary",
      label: "On Track",
    };
  }

  if (goal.progress_percentage >= 50) {
    return {
      badge: "warning" as const,
      ring: "stroke-amber-500",
      text: "text-amber-700",
      label: "Needs Attention",
    };
  }

  return {
    badge: "destructive" as const,
    ring: "stroke-red-500",
    text: "text-red-700",
    label: "Off Track",
  };
}

function goalSubtitle(goal: HealthGoal) {
  const directionLabel = goal.target_direction === "below" ? "Below" : goal.target_direction === "above" ? "Above" : "Exactly";
  return `${directionLabel} ${goal.target_value}`;
}

function goalValue(goal: HealthGoal) {
  return goal.current_value == null ? "Not logged" : `${goal.current_value}`;
}

function ProgressRing({ value, toneClass }: { value: number; toneClass: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;

  return (
    <div className="relative h-28 w-28">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} className="fill-none stroke-muted/60" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={cn("fill-none transition-all duration-500", toneClass)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{Math.round(value)}%</span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Progress</span>
      </div>
    </div>
  );
}

function GoalSparkline({ data }: { data: HealthGoal["trend"] }) {
  if (!data.length) {
    return <div className="h-16 rounded-xl bg-muted/40" />;
  }

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis hide dataKey="date" />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip formatter={(value) => [value, "Value"]} labelFormatter={(value) => format(new Date(value), "MMM d")} />
          <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GoalForm({
  editingGoal,
  onCancel,
  onSubmit,
}: {
  editingGoal: HealthGoal | null;
  onCancel: () => void;
  onSubmit: (payload: {
    id?: string;
    goal_type: HealthGoalType;
    target_value: number;
    target_direction: GoalDirection;
    start_date: string;
    target_date?: string | null;
  }) => Promise<boolean>;
}) {
  const [goalType, setGoalType] = useState<HealthGoalType>("bp_systolic");
  const [targetValue, setTargetValue] = useState("");
  const [direction, setDirection] = useState<GoalDirection>("below");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editingGoal) {
      setGoalType("bp_systolic");
      setTargetValue("");
      setDirection("below");
      setStartDate(new Date().toISOString().slice(0, 10));
      setTargetDate("");
      return;
    }

    setGoalType(editingGoal.goal_type);
    setTargetValue(String(editingGoal.target_value));
    setDirection(editingGoal.target_direction);
    setStartDate(editingGoal.start_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    setTargetDate(editingGoal.target_date?.slice(0, 10) || "");
  }, [editingGoal]);

  const submit = async () => {
    const numericValue = Number(targetValue);
    if (!Number.isFinite(numericValue)) {
      toast.error("Enter a valid target value.");
      return;
    }

    setSaving(true);
    const success = await onSubmit({
      id: editingGoal?.id,
      goal_type: goalType,
      target_value: numericValue,
      target_direction: direction,
      start_date: startDate,
      target_date: targetDate || null,
    });
    setSaving(false);

    if (success) {
      onCancel();
    }
  };

  return (
    <Card className="border-primary/15">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{editingGoal ? "Edit Goal" : "Set a New Goal"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Goal type</Label>
          <Select value={goalType} onValueChange={(value: HealthGoalType) => setGoalType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {goalTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Target value</Label>
            <Input value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder="130" />
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(value: GoalDirection) => setDirection(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="below">Keep Below</SelectItem>
                <SelectItem value="above">Keep Above</SelectItem>
                <SelectItem value="exact">Hit Exactly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Target date</Label>
            <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving..." : editingGoal ? "Update Goal" : "Set Goal"}
          </Button>
          {editingGoal && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function GoalAchievementModal({
  goal,
  open,
  onOpenChange,
  onSetNewGoal,
}: {
  goal: HealthGoal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetNewGoal: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !goal) {
      return;
    }

    confetti({
      particleCount: 180,
      spread: 120,
      origin: { y: 0.55 },
    });
  }, [goal, open]);

  const handleShare = async () => {
    if (!cardRef.current) {
      return;
    }

    const canvas = await html2canvas(cardRef.current, { backgroundColor: null });
    const link = document.createElement("a");
    link.download = `GoalAchievement_${goal?.goal_type || "goal"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Goal Achieved!</DialogTitle>
          <DialogDescription>
            You reached a health milestone. Keep this streak going.
          </DialogDescription>
        </DialogHeader>

        {goal && (
          <div ref={cardRef} className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10 p-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <Trophy className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-foreground">Goal Achieved!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              You reached your {goal.goal_label.toLowerCase()} target of {goal.target_value}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              It took you{" "}
              {Math.max(
                1,
                Math.round(
                  (new Date(goal.achieved_at || new Date()).getTime() - new Date(goal.start_date).getTime()) /
                    (24 * 60 * 60 * 1000)
                )
              )}{" "}
              days. Amazing work!
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => void handleShare()}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button onClick={onSetNewGoal}>
            <Sparkles className="mr-2 h-4 w-4" />
            Set New Goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HealthGoalsOverviewCard({ onOpenGoals }: { onOpenGoals: () => void }) {
  const { activeGoals, loading } = useHealthGoals();

  if (loading || activeGoals.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-background via-background to-primary/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Health Goals</p>
            <h3 className="text-lg font-bold text-foreground">Keep moving toward your targets</h3>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenGoals}>
            Open Goals
          </Button>
        </div>

        <div className="space-y-3">
          {activeGoals.slice(0, 3).map((goal) => {
            const tone = goalTone(goal);
            return (
              <button
                key={goal.id}
                type="button"
                onClick={onOpenGoals}
                className="w-full rounded-2xl border border-border/60 bg-background/70 p-4 text-left transition hover:border-primary/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{goal.goal_label}</p>
                    <p className="text-xs text-muted-foreground">{goalSubtitle(goal)}</p>
                  </div>
                  <Badge variant={tone.badge}>{goal.is_achieved ? "Achieved!" : `${goal.progress_percentage}% there`}</Badge>
                </div>
                <Progress value={goal.progress_percentage} className="mt-3 h-2.5" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function PatientGoalsTab() {
  const { activeGoals, achievedGoals, loading, saveGoal, deactivateGoal } = useHealthGoals();
  const [editingGoal, setEditingGoal] = useState<HealthGoal | null>(null);
  const [showAchieved, setShowAchieved] = useState(false);
  const reminderNoticeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const goal of activeGoals) {
      if (goal.progress_percentage >= 80 && goal.progress_percentage < 100 && !reminderNoticeIdsRef.current.has(`${goal.id}:almost`)) {
        reminderNoticeIdsRef.current.add(`${goal.id}:almost`);
        toast.message(`You are almost there! ${goal.goal_label} is ${goal.progress_percentage}% complete.`);
      } else if (goal.status === "needs_attention" && goal.trend.length >= 2 && !reminderNoticeIdsRef.current.has(`${goal.id}:attention`)) {
        const first = goal.trend[0]?.value;
        const last = goal.trend[goal.trend.length - 1]?.value;
        if (first != null && last != null && Math.abs(last - first) < 0.1) {
          reminderNoticeIdsRef.current.add(`${goal.id}:attention`);
          toast.warning(`Your ${goal.goal_label.toLowerCase()} goal needs attention. Consider consulting your doctor.`);
        }
      }
    }
  }, [activeGoals]);

  return (
    <div className="space-y-4">
      <GoalForm
        editingGoal={editingGoal}
        onCancel={() => setEditingGoal(null)}
        onSubmit={saveGoal}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {activeGoals.map((goal) => {
          const Icon = goalIcon(goal.goal_type);
          const tone = goalTone(goal);
          return (
            <Card key={goal.id} className="border-border/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{goal.goal_label}</p>
                      <p className="text-sm text-muted-foreground">{goalSubtitle(goal)}</p>
                    </div>
                  </div>
                  <Badge variant={tone.badge}>{tone.label}</Badge>
                </div>

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <ProgressRing value={goal.progress_percentage} toneClass={tone.ring} />
                  <div className="flex-1 space-y-2">
                    <div className="rounded-2xl bg-muted/40 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current vs Target</p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {goalValue(goal)} / {goal.target_value}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {goal.days_remaining == null
                        ? "No target date set"
                        : goal.days_remaining >= 0
                          ? `${goal.days_remaining} day(s) remaining`
                          : `${Math.abs(goal.days_remaining)} day(s) overdue`}
                    </div>
                  </div>
                </div>

                <GoalSparkline data={goal.trend} />

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingGoal(goal)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void deactivateGoal(goal.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && activeGoals.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold text-foreground">No active goals yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Set a target for blood pressure, sugar, weight, or adherence to start tracking progress.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowAchieved((prev) => !prev)}>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-600" />
              Achieved Goals
            </CardTitle>
            <Badge variant="secondary">{achievedGoals.length}</Badge>
          </button>
        </CardHeader>
        {showAchieved && (
          <CardContent className="space-y-3">
            {achievedGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No achieved goals yet.</p>
            ) : (
              achievedGoals.map((goal) => (
                <div key={goal.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{goal.goal_label}</p>
                      <p className="text-sm text-muted-foreground">{goalSubtitle(goal)}</p>
                    </div>
                    <Badge variant="success">Achieved</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Achieved on {goal.achieved_at ? format(new Date(goal.achieved_at), "MMM d, yyyy") : "recently"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export function CaregiverGoalsPanel({ patientId, readOnly = true }: { patientId: string; readOnly?: boolean }) {
  const { activeGoals, achievedGoals, loading, saveGoal, deactivateGoal } = useHealthGoals(patientId);
  const [editingGoal, setEditingGoal] = useState<HealthGoal | null>(null);

  return (
    <div className="space-y-4">
      {!readOnly && (
        <GoalForm editingGoal={editingGoal} onCancel={() => setEditingGoal(null)} onSubmit={saveGoal} />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Patient Goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading goals...</p>
          ) : activeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active goals for this patient yet.</p>
          ) : (
            activeGoals.map((goal) => {
              const tone = goalTone(goal);
              return (
                <div key={goal.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{goal.goal_label}</p>
                      <p className="text-sm text-muted-foreground">
                        Current {goalValue(goal)} • Target {goal.target_value}
                      </p>
                    </div>
                    <Badge variant={tone.badge}>{tone.label}</Badge>
                  </div>
                  <Progress value={goal.progress_percentage} className="mt-3 h-2.5" />
                  {goal.days_remaining != null && (
                    <p className="mt-2 text-xs text-muted-foreground">{goal.days_remaining} day(s) remaining</p>
                  )}
                  {!readOnly && (
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingGoal(goal)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void deactivateGoal(goal.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {achievedGoals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Achieved Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {achievedGoals.slice(0, 5).map((goal) => (
              <div key={goal.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{goal.goal_label}</p>
                  <Badge variant="success">Achieved</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {goal.achieved_at ? format(new Date(goal.achieved_at), "MMM d, yyyy") : "Completed"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
