import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdherenceRing } from "@/components/AdherenceRing";
import { BottomNav } from "@/components/BottomNav";
import { CaregiverBottomNav } from "@/components/CaregiverBottomNav";
import { CaregiverSection } from "@/components/CaregiverSection";
import { NotificationSettings } from "@/components/NotificationSettings";
import { PrivacySettings } from "@/components/PrivacySettings";
import { AppSettings } from "@/components/AppSettings";
import { HealthReportExport } from "@/components/HealthReportExport";
import { RefillTracker } from "@/components/RefillTracker";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";
import { PremiumBadge } from "@/components/PremiumBadge";
import { Icons } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserRole } from "@/hooks/useUserRole";
import { useCaregiverLinks } from "@/hooks/useCaregiverLinks";
import { apiClient } from "@/lib/apiClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Stethoscope, Users, Bell, Shield, FileText, Settings, Info, LogOut, AlertTriangle } from "lucide-react";

type SheetType = "caregiver" | "notifications" | "privacy" | "export" | "settings" | "refill" | "disclaimer" | null;

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, stats, loading } = useProfile();
  const { isCaregiver } = useUserRole();
  const { links } = useCaregiverLinks();
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [caregiverStats, setCaregiverStats] = useState({ patients: 0, reports: 0, alerts: 0 });

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";

  // Calculate caregiver stats
  const activePatients = useMemo(
    () => links.filter((l) => l.caregiver_id === user?.id && l.status === "active"),
    [links, user]
  );

  useEffect(() => {
    const fetchCaregiverStats = async () => {
      if (!isCaregiver || !user || activePatients.length === 0) {
        setCaregiverStats({ patients: activePatients.length, reports: 0, alerts: 0 });
        return;
      }

      let totalAlerts = 0;
      let totalReports = activePatients.length; // Each patient = 1 potential report

      for (const link of activePatients) {
        try {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const { data: doseLogs } = await apiClient
            .from("dose_logs")
            .select("status")
            .eq("user_id", link.patient_id)
            .gte("scheduled_time", weekAgo.toISOString());

          const missed = doseLogs?.filter((l) => l.status === "missed").length || 0;
          const total = doseLogs?.length || 0;
          const adherenceScore = total > 0 ? Math.round(((total - missed) / total) * 100) : 100;

          if (missed > 0) totalAlerts++;
          if (adherenceScore < 70) totalAlerts++;
        } catch (err) {
          console.error("Error fetching patient stats:", err);
        }
      }

      setCaregiverStats({
        patients: activePatients.length,
        reports: totalReports,
        alerts: totalAlerts,
      });
    };

    if (isCaregiver) {
      fetchCaregiverStats();
    }
  }, [isCaregiver, user, activePatients]);

  // Different menu items based on role
  const patientMenuItems = [
    { icon: Icons.users, label: "Caregiver Access", sheet: "caregiver" as SheetType, premium: true },
    { icon: Icons.bell, label: "Notification Settings", sheet: "notifications" as SheetType },
    { icon: Icons.shield, label: "Privacy & Security", sheet: "privacy" as SheetType },
    { icon: Icons.fileText, label: "Emergency Card", action: () => navigate("/emergency-card") },
    { icon: Icons.fileText, label: "Export Health Report", sheet: "export" as SheetType, premium: true },
    { icon: Icons.trending, label: "Adherence History", action: () => navigate("/reports") },
    { icon: Icons.package, label: "Refill Tracker", sheet: "refill" as SheetType },
    { icon: Icons.mapPin, label: "Find Pharmacy", action: () => navigate("/pharmacy-locator") },
    { icon: Icons.settings, label: "App Settings", sheet: "settings" as SheetType },
    { icon: Icons.info, label: "Medical Disclaimer", sheet: "disclaimer" as SheetType },
  ];

  const caregiverMenuItems = [
    { icon: Bell, label: "Notification Settings", sheet: "notifications" as SheetType },
    { icon: Shield, label: "Privacy & Security", sheet: "privacy" as SheetType },
    { icon: FileText, label: "Emergency Card", action: () => navigate("/emergency-card") },
    { icon: Settings, label: "App Settings", sheet: "settings" as SheetType },
    { icon: Info, label: "Medical Disclaimer", sheet: "disclaimer" as SheetType },
  ];

  const menuItems = isCaregiver ? caregiverMenuItems : patientMenuItems;

  const handleSignOut = async () => {
    localStorage.removeItem("selected_role");
    await signOut();
    navigate("/auth");
  };

  const sheetTitles: Record<Exclude<SheetType, null>, string> = {
    caregiver: "Caregiver Access",
    notifications: "Notification Settings",
    privacy: "Privacy & Security",
    export: "Export Health Report",
    settings: "App Settings",
    refill: "Refill Tracker",
    disclaimer: "Medical Disclaimer",
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      {/* Header - Different for caregivers */}
      <header className={`pt-8 pb-20 px-4 ${isCaregiver ? "bg-gradient-primary" : "bg-gradient-primary"}`}>
        <div className="container">
          <h1 className="text-xl font-bold text-primary-foreground mb-6">Profile</h1>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isCaregiver ? "bg-white/20" : "bg-primary-foreground/20"}`}>
              {isCaregiver ? (
                <Stethoscope className="w-8 h-8 text-white" />
              ) : (
                <span className="text-2xl font-bold text-primary-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-primary-foreground">
                {isCaregiver ? `Dr. ${displayName}` : displayName}
              </h2>
              <p className="text-primary-foreground/80 text-sm">{displayEmail}</p>
              <Badge variant="secondary" className="mt-1">
                {isCaregiver ? "Healthcare Provider" : "Free Plan"}
              </Badge>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Stats Card - Different for caregivers */}
      <main className="container px-4 -mt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="mb-6">
            <CardContent className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : isCaregiver ? (
                <div className="flex items-center justify-around">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-2">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{caregiverStats.patients}</p>
                    <p className="text-sm text-muted-foreground">Patients</p>
                  </div>
                  <div className="h-16 w-px bg-border" />
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mx-auto mb-2">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{caregiverStats.reports}</p>
                    <p className="text-sm text-muted-foreground">Reports</p>
                  </div>
                  <div className="h-16 w-px bg-border" />
                  <div className="text-center">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2 ${caregiverStats.alerts > 0 ? "bg-amber-100 dark:bg-amber-900/50" : "bg-emerald-100 dark:bg-emerald-900/50"}`}>
                      {caregiverStats.alerts > 0 ? (
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                      ) : (
                        <Bell className="w-6 h-6 text-emerald-600" />
                      )}
                    </div>
                    <p className={`text-3xl font-bold ${caregiverStats.alerts > 0 ? "text-amber-600" : "text-foreground"}`}>{caregiverStats.alerts}</p>
                    <p className="text-sm text-muted-foreground">Alerts</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-around">
                  <div className="text-center">
                    <AdherenceRing percentage={stats.adherenceScore} size={80} strokeWidth={8} />
                  </div>
                  <div className="h-16 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{stats.medicationCount}</p>
                    <p className="text-sm text-muted-foreground">Active Meds</p>
                  </div>
                  <div className="h-16 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{stats.adherenceStreak}</p>
                    <p className="text-sm text-muted-foreground">Day Streak</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Menu Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-2">
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const isPremium = (item as any).premium;
                return (
                  <button
                    key={index}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-accent transition-colors"
                    onClick={() => {
                      if ((item as any).action) {
                        (item as any).action();
                      } else if (item.sheet) {
                        setActiveSheet(item.sheet);
                      }
                    }}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCaregiver ? "bg-accent" : "bg-accent"}`}>
                      <Icon className={`w-5 h-5 ${isCaregiver ? "text-primary" : "text-primary"}`} />
                    </div>
                    <span className="flex-1 text-left font-medium text-foreground">
                      {item.label}
                    </span>
                    {isPremium && <PremiumBadge />}
                    <Icons.chevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* Logout */}
        <Button
          variant="ghost"
          className="w-full mt-6 text-destructive hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </main>

      {/* Bottom Sheet for Settings */}
      <Sheet open={activeSheet !== null} onOpenChange={() => setActiveSheet(null)}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>
              {activeSheet && sheetTitles[activeSheet]}
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto pb-8">
            {activeSheet === "caregiver" && <CaregiverSection />}
            {activeSheet === "notifications" && <NotificationSettings />}
            {activeSheet === "privacy" && <PrivacySettings />}
            {activeSheet === "export" && <HealthReportExport />}
            {activeSheet === "settings" && <AppSettings />}
            {activeSheet === "refill" && <RefillTracker />}
            {activeSheet === "disclaimer" && <MedicalDisclaimer variant="card" />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Role-specific navigation */}
      {isCaregiver ? <CaregiverBottomNav /> : <BottomNav />}
    </div>
  );
}
