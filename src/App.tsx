import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionsOnboarding } from "@/components/PermissionsOnboarding";
import { ReminderPopupManager } from "@/components/ReminderPopupManager";
import { OfflineBanner } from "@/components/OfflineBanner";
import { BiometricGate } from "@/components/BiometricGate";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Medications from "./pages/Medications";
import AddMedication from "./pages/AddMedication";
import Reminders from "./pages/Reminders";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";
import PharmacyLocator from "./pages/PharmacyLocator";
import EmergencyCard from "./pages/EmergencyCard";
import EmergencyCardPreview from "./pages/EmergencyCardPreview";
import PublicEmergencyCard from "./pages/PublicEmergencyCard";
import CaregiverDashboard from "./pages/CaregiverDashboard";
import CaregiverPatients from "./pages/CaregiverPatients";
import CaregiverNotifications from "./pages/CaregiverNotifications";
import CaregiverReports from "./pages/CaregiverReports";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorPatientView from "./pages/DoctorPatientView";
import DoctorInviteAccept from "./pages/DoctorInviteAccept";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Check if permissions onboarding has been completed
    const completed = localStorage.getItem("permissions_onboarding_complete");
    if (!completed) {
      setShowOnboarding(true);
    }
  }, []);

  if (showOnboarding) {
    return <PermissionsOnboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/medications" element={<ProtectedRoute><Medications /></ProtectedRoute>} />
      <Route path="/add-medication" element={<ProtectedRoute><AddMedication /></ProtectedRoute>} />
      <Route path="/reminders" element={<ProtectedRoute><Reminders /></ProtectedRoute>} />
      <Route path="/emergency-card" element={<ProtectedRoute><EmergencyCard /></ProtectedRoute>} />
      <Route path="/emergency-card/preview" element={<ProtectedRoute><EmergencyCardPreview /></ProtectedRoute>} />
      <Route path="/emergency-card/:card_id" element={<PublicEmergencyCard />} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/pharmacy-locator" element={<ProtectedRoute><PharmacyLocator /></ProtectedRoute>} />
      <Route path="/caregiver" element={<ProtectedRoute><CaregiverDashboard /></ProtectedRoute>} />
      <Route path="/caregiver/patients" element={<ProtectedRoute><CaregiverPatients /></ProtectedRoute>} />
      <Route path="/caregiver/notifications" element={<ProtectedRoute><CaregiverNotifications /></ProtectedRoute>} />
      <Route path="/caregiver/reports" element={<ProtectedRoute><CaregiverReports /></ProtectedRoute>} />
      <Route path="/doctor" element={<ProtectedRoute><DoctorDashboard /></ProtectedRoute>} />
      <Route path="/doctor/patient/:patientId" element={<ProtectedRoute><DoctorPatientView /></ProtectedRoute>} />
      <Route path="/doctor/accept/:token" element={<ProtectedRoute><DoctorInviteAccept /></ProtectedRoute>} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <OfflineBanner />
      <BrowserRouter>
        <AuthProvider>
          <BiometricGate>
            <ReminderPopupManager />
            <AppContent />
          </BiometricGate>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
