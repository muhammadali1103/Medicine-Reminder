import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { apiClient } from "@/lib/apiClient";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Heart,
  AlertTriangle,
  TrendingDown,
  Check,
  X,
  CheckCircle,
  Clock,
} from "lucide-react";

interface Notification {
  id: string;
  type: "invitation" | "missed_dose" | "low_adherence" | "alert" | "health_alert" | "escalation";
  message: string;
  patientName: string;
  patientId?: string;
  linkId?: string;
  timestamp: Date;
  read: boolean;
}

interface CaregiverHealthSummaryResponse {
  vitals: {
    systolic?: number | null;
    blood_sugar?: number | null;
  } | null;
}

export default function CaregiverNotifications() {
  const { user } = useAuth();
  const { links, loading: linksLoading, acceptLink, rejectLink } = useCaregiverLinks();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const pendingInvitations = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "pending"),
    [links, user]
  );

  const activePatientLinks = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "active"),
    [links, user]
  );

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const newNotifications: Notification[] = [];

      const { data: escalationNotifications } = await apiClient
        .from("caregiver_notifications")
        .select("*")
        .eq("caregiver_id", user.id)
        .order("created_at", { ascending: false });

      for (const alert of escalationNotifications || []) {
        const patientLink = activePatientLinks.find((link) => link.patient_id === alert.patient_id);
        newNotifications.push({
          id: `escalation-${alert.id}`,
          type: "escalation",
          message: alert.message,
          patientName: patientLink?.patient_profile?.full_name || "Patient",
          patientId: alert.patient_id,
          timestamp: new Date(alert.created_at),
          read: Boolean(alert.is_read),
        });
      }

      // Add invitation notifications
      for (const inv of pendingInvitations) {
        newNotifications.push({
          id: `invite-${inv.id}`,
          type: "invitation",
          message: `${inv.patient_profile?.full_name || "A patient"} wants you to monitor their health`,
          patientName: inv.patient_profile?.full_name || "Patient",
          linkId: inv.id,
          timestamp: new Date(inv.created_at),
          read: false,
        });
      }

      // Fetch alerts for active patients
      for (const link of activePatientLinks) {
        try {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const { data: doseLogs } = await apiClient
            .from("dose_logs")
            .select("status")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const taken = doseLogs?.filter((l) => l.status === "taken" || l.status === "late").length || 0;
          const missed = doseLogs?.filter((l) => l.status === "missed").length || 0;
          const total = doseLogs?.length || 0;
          const adherenceScore = total > 0 ? Math.round((taken / total) * 100) : 100;

          if (missed > 0) {
            newNotifications.push({
              id: `missed-${link.patient_id}`,
              type: "missed_dose",
              message: `${link.patient_profile?.full_name || "Patient"} has missed ${missed} dose(s) this week`,
              patientName: link.patient_profile?.full_name || "Patient",
              patientId: link.patient_id,
              timestamp: new Date(),
              read: false,
            });
          }

          if (adherenceScore < 70) {
            newNotifications.push({
              id: `adherence-${link.patient_id}`,
              type: "low_adherence",
              message: `${link.patient_profile?.full_name || "Patient"}'s adherence is at ${adherenceScore}%`,
              patientName: link.patient_profile?.full_name || "Patient",
              patientId: link.patient_id,
              timestamp: new Date(),
              read: false,
            });
          }

          const healthSummary = await apiClient.request<{ data: CaregiverHealthSummaryResponse | null; error: { message?: string } | null }>(
            `/health/summary?patientId=${encodeURIComponent(link.patient_id)}`
          );
          const vitals = healthSummary.data?.vitals;

          if (vitals?.systolic && vitals.systolic > 160) {
            newNotifications.push({
              id: `bp-${link.patient_id}`,
              type: "health_alert",
              message: `${link.patient_profile?.full_name || "Patient"} has high blood pressure reading today`,
              patientName: link.patient_profile?.full_name || "Patient",
              patientId: link.patient_id,
              timestamp: new Date(),
              read: false,
            });
          } else if (vitals?.blood_sugar && (vitals.blood_sugar > 300 || vitals.blood_sugar < 70)) {
            newNotifications.push({
              id: `sugar-${link.patient_id}`,
              type: "health_alert",
              message: `${link.patient_profile?.full_name || "Patient"} has a critical blood sugar reading today`,
              patientName: link.patient_profile?.full_name || "Patient",
              patientId: link.patient_id,
              timestamp: new Date(),
              read: false,
            });
          }
        } catch (err) {
          console.error("Error fetching patient alerts:", err);
        }
      }

      // Sort by timestamp
      newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setNotifications(newNotifications);
      setLoading(false);
    };

    fetchNotifications();
  }, [user, pendingInvitations, activePatientLinks]);

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "invitation": return Heart;
      case "missed_dose": return AlertTriangle;
      case "low_adherence": return TrendingDown;
      case "health_alert": return AlertTriangle;
      case "escalation": return AlertTriangle;
      default: return Bell;
    }
  };

  const getNotificationColor = (type: Notification["type"]) => {
    switch (type) {
      case "invitation": return "text-pink-500 bg-pink-500/10";
      case "missed_dose": return "text-red-500 bg-red-500/10";
      case "low_adherence": return "text-amber-500 bg-amber-500/10";
      case "health_alert": return "text-red-500 bg-red-500/10";
      case "escalation": return "text-red-500 bg-red-500/10";
      default: return "text-primary bg-primary/10";
    }
  };

  const handleAccept = async (linkId: string) => {
    await acceptLink(linkId);
  };

  const handleReject = async (linkId: string) => {
    await rejectLink(linkId);
  };

  const invitationNotifications = notifications.filter(n => n.type === "invitation");
  const alertNotifications = notifications.filter(n => n.type !== "invitation");

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <header className="bg-gradient-primary pt-safe px-4 py-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Notifications
        </h1>
        <p className="text-white/80 text-sm mt-1">
          {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
        </p>
      </header>

      <main className="px-4 py-4 space-y-6">
        {loading || linksLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Loading notifications...</p>
            </CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">All Caught Up!</h3>
              <p className="text-sm text-muted-foreground">
                No new notifications at the moment.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Pending Invitations */}
            {invitationNotifications.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  PENDING INVITATIONS
                </h2>
                <div className="space-y-3">
                  {invitationNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <Card className="border-primary/20">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getNotificationColor(notification.type)}`}>
                              <Heart className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{notification.patientName}</p>
                              <p className="text-sm text-muted-foreground">{notification.message}</p>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-red-500 hover:text-red-600"
                              onClick={() => notification.linkId && handleReject(notification.linkId)}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-gradient-primary text-primary-foreground hover:brightness-110"
                              onClick={() => notification.linkId && handleAccept(notification.linkId)}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Accept
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts */}
            {alertNotifications.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  PATIENT ALERTS
                </h2>
                <ScrollArea className="h-[calc(100vh-400px)]">
                  <div className="space-y-3 pr-2">
                    {alertNotifications.map((notification, index) => {
                      const Icon = getNotificationIcon(notification.type);
                      return (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <Card>
                            <CardContent className="p-4 flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getNotificationColor(notification.type)}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-foreground">{notification.patientName}</p>
                                <p className="text-sm text-muted-foreground">{notification.message}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </>
        )}
      </main>

      <CaregiverBottomNav />
    </div>
  );
}
