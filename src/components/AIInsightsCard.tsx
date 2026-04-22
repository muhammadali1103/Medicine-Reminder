import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

interface AdherenceData {
  totalDoses: number;
  takenDoses: number;
  missedDoses: number;
  adherenceScore: number;
  dailyData: Array<{
    date: string;
    taken: number;
    missed: number;
    adherence: number;
  }>;
}

interface AIInsightsCardProps {
  userId: string;
  adherenceData: AdherenceData;
  period: "weekly" | "monthly";
  className?: string;
}

interface Insight {
  type: "positive" | "suggestion" | "observation";
  text: string;
  icon: typeof Icons.trending;
}

export function AIInsightsCard({
  userId,
  adherenceData,
  period,
  className,
}: AIInsightsCardProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateInsights();
  }, [adherenceData, period]);

  const generateInsights = async () => {
    if (adherenceData.totalDoses === 0) {
      setInsights([{
        type: "observation",
        text: "Start logging doses to see personalized insights about your medication adherence.",
        icon: Icons.info,
      }]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await apiClient.functions.invoke("generate-insights", {
        body: {
          adherenceData,
          period,
        },
      });

      if (fnError) {
        console.error("AI insights error:", fnError);
        // Fallback to rule-based insights
        setInsights(generateRuleBasedInsights(adherenceData, period));
        return;
      }

      if (data?.insights && Array.isArray(data.insights)) {
        setInsights(data.insights.map((insight: any) => ({
          type: insight.type || "observation",
          text: insight.text,
          icon: insight.type === "positive" ? Icons.trending : 
                insight.type === "suggestion" ? Icons.lightbulb : Icons.info,
        })));
      } else {
        setInsights(generateRuleBasedInsights(adherenceData, period));
      }
    } catch (err) {
      console.error("Failed to generate insights:", err);
      setInsights(generateRuleBasedInsights(adherenceData, period));
    } finally {
      setLoading(false);
    }
  };

  const generateRuleBasedInsights = (data: AdherenceData, period: string): Insight[] => {
    const insights: Insight[] = [];
    
    // Adherence trend analysis
    if (data.adherenceScore >= 90) {
      insights.push({
        type: "positive",
        text: `Excellent! Your ${period} adherence of ${data.adherenceScore}% shows great consistency.`,
        icon: Icons.trending,
      });
    } else if (data.adherenceScore >= 70) {
      insights.push({
        type: "observation",
        text: `Your ${period} adherence is ${data.adherenceScore}%. Consider setting additional reminders to improve.`,
        icon: Icons.info,
      });
    } else if (data.adherenceScore > 0) {
      insights.push({
        type: "suggestion",
        text: `Your adherence dropped to ${data.adherenceScore}%. Try linking medication times to daily routines.`,
        icon: Icons.lightbulb,
      });
    }

    // Day pattern analysis
    if (data.dailyData.length >= 7) {
      const weekendData = data.dailyData.filter((d) => {
        const day = new Date(d.date).getDay();
        return day === 0 || day === 6;
      });
      const weekdayData = data.dailyData.filter((d) => {
        const day = new Date(d.date).getDay();
        return day !== 0 && day !== 6;
      });

      const weekendAdherence = weekendData.length > 0
        ? weekendData.reduce((sum, d) => sum + d.adherence, 0) / weekendData.length
        : 0;
      const weekdayAdherence = weekdayData.length > 0
        ? weekdayData.reduce((sum, d) => sum + d.adherence, 0) / weekdayData.length
        : 0;

      if (weekdayAdherence - weekendAdherence > 20) {
        insights.push({
          type: "suggestion",
          text: "Weekend adherence is lower. Consider setting weekend-specific reminders.",
          icon: Icons.lightbulb,
        });
      }
    }

    // Improvement trend
    if (data.dailyData.length >= 3) {
      const recentDays = data.dailyData.slice(-3);
      const earlierDays = data.dailyData.slice(0, 3);
      const recentAvg = recentDays.reduce((s, d) => s + d.adherence, 0) / recentDays.length;
      const earlierAvg = earlierDays.reduce((s, d) => s + d.adherence, 0) / earlierDays.length;

      if (recentAvg > earlierAvg + 10) {
        insights.push({
          type: "positive",
          text: "Your adherence is improving! Keep up the great work.",
          icon: Icons.trending,
        });
      }
    }

    // Zero missed is positive
    if (data.missedDoses === 0 && data.totalDoses > 0) {
      insights.push({
        type: "positive",
        text: "Perfect record! You haven't missed any doses this period.",
        icon: Icons.check,
      });
    }

    return insights.slice(0, 3); // Limit to 3 insights
  };

  const iconForType = (type: string) => {
    switch (type) {
      case "positive":
        return Icons.trending;
      case "suggestion":
        return Icons.lightbulb;
      default:
        return Icons.info;
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icons.sparkles className="w-4 h-4 text-primary" />
          AI Insights
          <Badge variant="secondary" className="ml-auto text-xs">
            {period === "weekly" ? "7 days" : "30 days"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full"
            />
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="ghost" size="sm" onClick={generateInsights} className="mt-2">
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, index) => {
              const Icon = iconForType(insight.type);
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl",
                    insight.type === "positive"
                      ? "bg-success/10"
                      : insight.type === "suggestion"
                      ? "bg-warning/10"
                      : "bg-muted"
                  )}
                >
                  <Icon className={cn(
                    "w-5 h-5 mt-0.5 shrink-0",
                    insight.type === "positive"
                      ? "text-success"
                      : insight.type === "suggestion"
                      ? "text-warning"
                      : "text-muted-foreground"
                  )} />
                  <p className="text-sm text-foreground">{insight.text}</p>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}