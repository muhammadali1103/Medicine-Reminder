import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/BottomNav";
import { AIInsightsCard } from "@/components/AIInsightsCard";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";
import { Icons } from "@/components/icons";
import { apiClient } from "@/lib/apiClient";
import { format, subDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DoseLog {
  id: string;
  scheduled_time: string;
  status: string;
  medications?: { name: string } | null;
}

export default function Reports() {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    const fetchLogs = async () => {
      // Wait for auth to complete before proceeding
      if (authLoading) return;
      
      if (!user) {
        setLoading(false);
        setLogs([]);
        return;
      }

      setLoading(true);
      const daysBack = period === "weekly" ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      try {
        const { data, error } = await apiClient
          .from("dose_logs")
          .select("id, scheduled_time, status, medications(name)")
          .eq("user_id", user.id)
          .gte("scheduled_time", startDate.toISOString())
          .order("scheduled_time", { ascending: false });

        if (error) {
          console.error("Error fetching logs:", error);
          setLogs([]);
        } else {
          setLogs(data || []);
        }
      } catch (err) {
        console.error("Unexpected error fetching logs:", err);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [user, authLoading, period]);

  const chartData = useMemo(() => {
    const days = period === "weekly" ? 7 : 30;
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayLogs = logs.filter((log) => {
        const logDate = new Date(log.scheduled_time);
        return logDate >= date && logDate < nextDate;
      });

      const taken = dayLogs.filter(
        (l) => l.status === "taken" || l.status === "late"
      ).length;
      const missed = dayLogs.filter((l) => l.status === "missed").length;
      const total = dayLogs.length;
      const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;

      data.push({
        date: date.toLocaleDateString("en-US", {
          weekday: period === "weekly" ? "short" : undefined,
          month: period === "monthly" ? "short" : undefined,
          day: "numeric",
        }),
        taken,
        missed,
        adherence,
        total,
      });
    }

    return data;
  }, [logs, period]);

  const stats = useMemo(() => {
    const total = logs.length;
    const taken = logs.filter(
      (l) => l.status === "taken" || l.status === "late"
    ).length;
    const missed = logs.filter((l) => l.status === "missed").length;
    const skipped = logs.filter((l) => l.status === "skipped").length;

    return {
      total,
      taken,
      missed,
      skipped,
      adherence: total > 0 ? Math.round((taken / total) * 100) : 0,
    };
  }, [logs]);

  const missedMedicines = useMemo(() => {
    return logs
      .filter((l) => l.status === "missed")
      .map((log) => ({
        id: log.id,
        medicationName: log.medications?.name || "Unknown Medication",
        scheduledTime: new Date(log.scheduled_time),
      }));
  }, [logs]);

  const chartConfig = {
    taken: {
      label: "Taken",
      color: "hsl(152 60% 45%)",
    },
    missed: {
      label: "Missed",
      color: "hsl(0 72% 58%)",
    },
    adherence: {
      label: "Adherence",
      color: "hsl(174 62% 42%)",
    },
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-8 pb-6 px-4">
        <div className="container">
          <h1 className="text-xl font-bold text-primary-foreground">
            Adherence Reports
          </h1>
          <p className="text-primary-foreground/80 text-sm mt-1">
            Track your medication history
          </p>
        </div>
      </header>

      <main className="container px-4 -mt-2">
        <Tabs
          value={period}
          onValueChange={(v) => setPeriod(v as "weekly" | "monthly")}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <TabsContent value={period} className="mt-4 space-y-4">
            {/* Summary Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icons.trending className="w-4 h-4 text-primary" />
                    {period === "weekly" ? "This Week" : "This Month"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">
                        {stats.adherence}%
                      </p>
                      <p className="text-xs text-muted-foreground">Adherence</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-success">
                        {stats.taken}
                      </p>
                      <p className="text-xs text-muted-foreground">Taken</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-destructive">
                        {stats.missed}
                      </p>
                      <p className="text-xs text-muted-foreground">Missed</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-muted-foreground">
                        {stats.skipped}
                      </p>
                      <p className="text-xs text-muted-foreground">Skipped</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Adherence Trend Line Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Adherence Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-48 flex items-center justify-center">
                      <p className="text-muted-foreground">Loading...</p>
                    </div>
                  ) : chartData.length === 0 ||
                    chartData.every((d) => d.total === 0) ? (
                    <div className="h-48 flex items-center justify-center">
                      <p className="text-muted-foreground">No data yet</p>
                    </div>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-48 w-full">
                      <LineChart data={chartData}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="adherence"
                          stroke="hsl(174 62% 42%)"
                          strokeWidth={2}
                          dot={{ fill: "hsl(174 62% 42%)", strokeWidth: 0, r: 4 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Dose Status Bar Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Daily Doses</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-48 flex items-center justify-center">
                      <p className="text-muted-foreground">Loading...</p>
                    </div>
                  ) : chartData.length === 0 ||
                    chartData.every((d) => d.total === 0) ? (
                    <div className="h-48 flex items-center justify-center">
                      <p className="text-muted-foreground">No data yet</p>
                    </div>
                  ) : (
                    <ChartContainer config={chartConfig} className="h-48 w-full">
                      <BarChart data={chartData}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="taken"
                          fill="hsl(152 60% 45%)"
                          radius={[4, 4, 0, 0]}
                          stackId="stack"
                        />
                        <Bar
                          dataKey="missed"
                          fill="hsl(0 72% 58%)"
                          radius={[4, 4, 0, 0]}
                          stackId="stack"
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* AI Insights */}
            {user && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <AIInsightsCard
                  userId={user.id}
                  adherenceData={{
                    totalDoses: stats.total,
                    takenDoses: stats.taken,
                    missedDoses: stats.missed,
                    adherenceScore: stats.adherence,
                    dailyData: chartData.map(d => ({
                      date: d.date,
                      taken: d.taken,
                      missed: d.missed,
                      adherence: d.adherence,
                    })),
                  }}
                  period={period}
                />
              </motion.div>
            )}

            {/* Enhanced Missed Medicines List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icons.warning className="w-4 h-4 text-destructive" />
                    Missed Medicines
                    {missedMedicines.length > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {missedMedicines.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-32 flex items-center justify-center">
                      <p className="text-muted-foreground">Loading...</p>
                    </div>
                  ) : missedMedicines.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-center p-4">
                      <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                        <Icons.check className="w-6 h-6 text-success" />
                      </div>
                      <p className="font-medium text-foreground">Perfect Record!</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        No missed medicines this {period === "weekly" ? "week" : "month"}
                      </p>
                      <Badge variant="success" className="mt-2">
                        <Icons.trending className="w-3 h-3 mr-1" />
                        On Track
                      </Badge>
                    </div>
                  ) : (
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {missedMedicines.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 bg-destructive/5 border border-destructive/10 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-destructive" />
                              <div>
                                <p className="font-medium text-sm">{item.medicationName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(item.scheduledTime, "MMM d, yyyy")} at {format(item.scheduledTime, "h:mm a")}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-destructive border-destructive/30">
                              Missed
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Medical Disclaimer */}
            <MedicalDisclaimer variant="footer" className="mt-6" />
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav />
    </div>
  );
}
