import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";

export type HealthStatus = "Normal" | "Elevated" | "High" | "Low" | "Logged" | null;
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type PlanCreator = "patient" | "doctor";

export interface VitalEntry {
  id: string;
  user_id: string;
  systolic: number | null;
  diastolic: number | null;
  blood_sugar: number | null;
  heart_rate: number | null;
  weight: number | null;
  notes: string | null;
  logged_at: string;
  bp_status?: HealthStatus;
  sugar_status?: HealthStatus;
  heart_rate_status?: HealthStatus;
  weight_status?: HealthStatus;
}

export interface VitalHistoryGroup {
  log_date: string;
  systolic_min: number | null;
  systolic_max: number | null;
  systolic_avg: number | null;
  diastolic_min: number | null;
  diastolic_max: number | null;
  diastolic_avg: number | null;
  sugar_min: number | null;
  sugar_max: number | null;
  sugar_avg: number | null;
  heart_rate_min: number | null;
  heart_rate_max: number | null;
  heart_rate_avg: number | null;
  weight_min: number | null;
  weight_max: number | null;
  weight_avg: number | null;
  entries_count: number;
}

export interface HealthAlert {
  type: string;
  severity: "medium" | "high";
  message: string;
}

export interface DietMeal {
  id?: string;
  meal_type: MealType;
  meal_name: string;
  description?: string;
  calories?: number | null;
  avoid_foods?: string;
  recommended_foods?: string;
  meal_time?: string;
}

export interface DietPlan {
  id: string;
  patient_user_id: string;
  title: string;
  created_by: PlanCreator;
  doctor_name: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  meals: DietMeal[];
}

export interface DietLogEntry {
  id: string;
  user_id: string;
  diet_plan_id: string | null;
  meal_type: MealType;
  meal_name: string | null;
  followed_plan: boolean;
  notes: string | null;
  logged_at: string;
}

export interface DietAdherenceSummary {
  total: number;
  followed: number;
  percentage: number;
  by_meal_type: Array<{
    meal_type: MealType;
    total: number;
    followed: number;
    percentage: number;
  }>;
}

export type HealthGoalType =
  | "bp_systolic"
  | "bp_diastolic"
  | "blood_sugar"
  | "weight"
  | "heart_rate"
  | "medication_adherence"
  | "diet_adherence"
  | "water_intake";

export type GoalDirection = "below" | "above" | "exact";
export type GoalStatus = "on_track" | "needs_attention" | "achieved";

export interface HealthGoal {
  id: string;
  user_id: string;
  goal_type: HealthGoalType;
  goal_label: string;
  target_value: number;
  target_direction: GoalDirection;
  current_value: number | null;
  progress_percentage: number;
  status: GoalStatus;
  start_date: string;
  target_date: string | null;
  days_remaining: number | null;
  is_achieved: boolean;
  achieved_at: string | null;
  is_active: boolean;
  created_at: string;
  trend: Array<{
    date: string;
    value: number | null;
  }>;
}

interface GoalsResponse {
  active: HealthGoal[];
  achieved: HealthGoal[];
}

export interface HealthSummary {
  vitals: VitalEntry | null;
  diet_today: {
    followed: number;
    logged: number;
    planned: number;
  };
  active_plan: { id: string; title: string } | null;
}

interface VitalsHistoryResponse {
  grouped: VitalHistoryGroup[];
  entries: VitalEntry[];
}

interface DietHistoryResponse {
  entries: DietLogEntry[];
  adherence: DietAdherenceSummary;
  weekly_adherence: DietAdherenceSummary;
}

interface ApiErrorLike {
  message?: string;
  code?: string;
}

function buildPatientQuery(patientId?: string) {
  return patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
}

export function useVitals(patientId?: string) {
  const { user } = useAuth();
  const [latest, setLatest] = useState<(VitalEntry & { alerts?: HealthAlert[] }) | null>(null);
  const [history, setHistory] = useState<VitalHistoryGroup[]>([]);
  const [entries, setEntries] = useState<VitalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVitals = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const query = buildPatientQuery(patientId);
    const [latestResponse, historyResponse] = await Promise.all([
      apiClient.request<{ data: (VitalEntry & { alerts?: HealthAlert[] }) | null; error: ApiErrorLike | null }>(`/vitals/latest${query}`),
      apiClient.request<{ data: VitalsHistoryResponse; error: ApiErrorLike | null }>(`/vitals/history${query}`),
    ]);

    if (!latestResponse.error) {
      setLatest(latestResponse.data);
    }

    if (!historyResponse.error && historyResponse.data) {
      setHistory(historyResponse.data.grouped || []);
      setEntries(historyResponse.data.entries || []);
    }

    setLoading(false);
  }, [patientId, user]);

  useEffect(() => {
    fetchVitals();
  }, [fetchVitals]);

  const logVitals = useCallback(
    async (payload: {
      systolic?: number | null;
      diastolic?: number | null;
      bloodSugar?: number | null;
      heartRate?: number | null;
      weight?: number | null;
      notes?: string;
    }) => {
      const response = await apiClient.request<{
        data: (VitalEntry & { alerts?: HealthAlert[]; achieved_goals?: HealthGoal[] }) | null;
        error: { message?: string } | null;
      }>("/vitals/log", {
        method: "POST",
        body: JSON.stringify({
          systolic: payload.systolic,
          diastolic: payload.diastolic,
          bloodSugar: payload.bloodSugar,
          heartRate: payload.heartRate,
          weight: payload.weight,
          notes: payload.notes,
        }),
      });

      if (response.error) {
        toast.error(response.error.message || "Failed to log vitals");
        return null;
      }

      await fetchVitals();
      return response.data;
    },
    [fetchVitals]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      const response = await apiClient.request<{ data: { success: boolean }; error: ApiErrorLike | null }>(`/vitals/${id}`, {
        method: "DELETE",
      });

      if (response.error) {
        toast.error(response.error.message || "Failed to delete vital entry");
        return false;
      }

      await fetchVitals();
      return true;
    },
    [fetchVitals]
  );

  const chartData = useMemo(
    () =>
      [...history]
        .slice(0, 14)
        .reverse()
        .map((item) => ({
          date: item.log_date,
          systolic: item.systolic_avg,
          diastolic: item.diastolic_avg,
          bloodSugar: item.sugar_avg,
          heartRate: item.heart_rate_avg,
        })),
    [history]
  );

  return {
    latest,
    history,
    entries,
    chartData,
    loading,
    fetchVitals,
    logVitals,
    deleteEntry,
  };
}

export function useDietPlans(patientId?: string) {
  const { user } = useAuth();
  const [activePlan, setActivePlan] = useState<DietPlan | null>(null);
  const [history, setHistory] = useState<DietHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDiet = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const query = buildPatientQuery(patientId);

    const [planResponse, historyResponse] = await Promise.all([
      apiClient.request<{ data: DietPlan | null; error: ApiErrorLike | null }>(`/diet/plan/active${query}`),
      apiClient.request<{ data: DietHistoryResponse; error: ApiErrorLike | null }>(`/diet/log/history${query}`),
    ]);

    if (!planResponse.error) {
      setActivePlan(planResponse.data);
    }

    if (!historyResponse.error) {
      setHistory(historyResponse.data);
    }

    setLoading(false);
  }, [patientId, user]);

  useEffect(() => {
    fetchDiet();
  }, [fetchDiet]);

  const savePlan = useCallback(
    async (payload: {
      id?: string;
      title: string;
      created_by: PlanCreator;
      doctor_name?: string;
      start_date?: string;
      end_date?: string;
      notes?: string;
      meals: DietMeal[];
    }) => {
      const path = payload.id ? `/diet/plan/${payload.id}` : "/diet/plan";
      const method = payload.id ? "PUT" : "POST";
      const response = await apiClient.request<{ data: { success?: boolean; id?: string } | null; error: ApiErrorLike | null }>(path, {
        method,
        body: JSON.stringify(payload),
      });

      if (response.error) {
        toast.error(response.error.message || "Unable to save diet plan");
        return false;
      }

      toast.success(payload.id ? "Diet plan updated" : "Diet plan saved");
      await fetchDiet();
      return true;
    },
    [fetchDiet]
  );

  const deactivatePlan = useCallback(
    async (id: string) => {
      const response = await apiClient.request<{ data: { success?: boolean } | null; error: ApiErrorLike | null }>(`/diet/plan/${id}`, {
        method: "DELETE",
      });

      if (response.error) {
        toast.error(response.error.message || "Unable to deactivate plan");
        return false;
      }

      toast.success("Diet plan archived");
      await fetchDiet();
      return true;
    },
    [fetchDiet]
  );

  const logMeal = useCallback(
    async (payload: {
      diet_plan_id?: string | null;
      meal_type: MealType;
      meal_name?: string;
      followed_plan: boolean;
      notes?: string;
    }) => {
      const response = await apiClient.request<{ data: { success?: boolean } | null; error: ApiErrorLike | null }>("/diet/log", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (response.error) {
        toast.error(response.error.message || "Unable to log meal");
        return false;
      }

      toast.success(payload.followed_plan ? "Meal marked as followed" : "Meal logged");
      await fetchDiet();
      return true;
    },
    [fetchDiet]
  );

  return {
    activePlan,
    history,
    loading,
    fetchDiet,
    savePlan,
    deactivatePlan,
    logMeal,
  };
}

export function useHealthGoals(patientId?: string) {
  const { user } = useAuth();
  const [activeGoals, setActiveGoals] = useState<HealthGoal[]>([]);
  const [achievedGoals, setAchievedGoals] = useState<HealthGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const response = await apiClient.request<{ data: GoalsResponse | null; error: ApiErrorLike | null }>(
      `/goals${buildPatientQuery(patientId)}`
    );

    if (!response.error && response.data) {
      setActiveGoals(response.data.active || []);
      setAchievedGoals(response.data.achieved || []);
    }

    setLoading(false);
  }, [patientId, user]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const saveGoal = useCallback(
    async (payload: {
      id?: string;
      goal_type: HealthGoalType;
      target_value: number;
      target_direction: GoalDirection;
      start_date: string;
      target_date?: string | null;
    }) => {
      const path = payload.id ? `/goals/${payload.id}` : "/goals";
      const method = payload.id ? "PUT" : "POST";
      const response = await apiClient.request<{ data: HealthGoal | null; error: ApiErrorLike | null }>(path, {
        method,
        body: JSON.stringify({
          ...payload,
          ...(patientId ? { patientId } : {}),
        }),
      });

      if (response.error) {
        toast.error(response.error.message || "Unable to save goal");
        return false;
      }

      toast.success(payload.id ? "Goal updated" : "Goal created");
      await fetchGoals();
      return true;
    },
    [fetchGoals, patientId]
  );

  const deactivateGoal = useCallback(
    async (id: string) => {
      const response = await apiClient.request<{ data: { success?: boolean } | null; error: ApiErrorLike | null }>(
        `/goals/${id}${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""}`,
        {
          method: "DELETE",
        }
      );

      if (response.error) {
        toast.error(response.error.message || "Unable to remove goal");
        return false;
      }

      toast.success("Goal archived");
      await fetchGoals();
      return true;
    },
    [fetchGoals, patientId]
  );

  const checkGoals = useCallback(async () => {
    const response = await apiClient.request<{ data: HealthGoal[] | null; error: ApiErrorLike | null }>("/goals/check", {
      method: "POST",
      body: JSON.stringify(patientId ? { patientId } : {}),
    });

    if (!response.error) {
      await fetchGoals();
    }

    return response.data || [];
  }, [fetchGoals, patientId]);

  return {
    activeGoals,
    achievedGoals,
    loading,
    fetchGoals,
    saveGoal,
    deactivateGoal,
    checkGoals,
  };
}

export function useHealthSummary(patientId?: string) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const response = await apiClient.request<{ data: HealthSummary | null; error: ApiErrorLike | null }>(
      `/health/summary${buildPatientQuery(patientId)}`
    );

    if (!response.error) {
      setSummary(response.data);
    }

    setLoading(false);
  }, [patientId, user]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    fetchSummary,
  };
}
