import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bell, MapPin, ChevronRight, Shield, AlertCircle } from "lucide-react";

interface PermissionStep {
  id: "notifications" | "location";
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  deniedMessage: string;
  settingsInstruction: string;
}

const permissionSteps: PermissionStep[] = [
  {
    id: "notifications",
    title: "Enable In-App Alerts",
    description: "Allow Smart Medicine Reminder to show popup alerts when it is time to take your medicine?",
    icon: Bell,
    color: "text-primary",
    deniedMessage: "Popup reminders are disabled. You can turn them back on later from the reminder settings screen.",
    settingsInstruction: "Open Profile > Reminder Settings > turn on Medication Popups",
  },
  {
    id: "location",
    title: "Location Access",
    description: "Allow location access to improve AI pill identification accuracy and regional pharmacy services?",
    icon: MapPin,
    color: "text-success",
    deniedMessage: "Location enhancements are disabled. Core app functionality remains available.",
    settingsInstruction: "Settings > Apps > Smart Medicine Reminder > Permissions > Location",
  },
];

interface PermissionsOnboardingProps {
  onComplete: () => void;
}

export function PermissionsOnboarding({ onComplete }: PermissionsOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [permissions, setPermissions] = useState<Record<string, "granted" | "denied" | "pending">>({
    notifications: "pending",
    location: "pending",
  });
  const [showDeniedMessage, setShowDeniedMessage] = useState(false);

  const currentPermission = permissionSteps[currentStep];

  const requestNotificationPermission = async (): Promise<boolean> => true;

  const requestLocationPermission = async (): Promise<boolean> => {
    if (!("geolocation" in navigator)) {
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { timeout: 10000 }
      );
    });
  };

  const handleAllow = async () => {
    let granted = false;

    if (currentPermission.id === "notifications") {
      granted = await requestNotificationPermission();
    } else if (currentPermission.id === "location") {
      granted = await requestLocationPermission();
    }

    setPermissions((prev) => ({
      ...prev,
      [currentPermission.id]: granted ? "granted" : "denied",
    }));

    localStorage.setItem(`permission_${currentPermission.id}`, granted ? "granted" : "denied");

    if (granted) {
      moveToNextStep();
    } else {
      setShowDeniedMessage(true);
    }
  };

  const handleDeny = () => {
    setPermissions((prev) => ({
      ...prev,
      [currentPermission.id]: "denied",
    }));
    localStorage.setItem(`permission_${currentPermission.id}`, "denied");
    setShowDeniedMessage(true);
  };

  const handleOpenSettings = () => {
    window.open("app-settings:", "_self");
  };

  const moveToNextStep = () => {
    setShowDeniedMessage(false);
    if (currentStep < permissionSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      localStorage.setItem("permissions_onboarding_complete", "true");
      onComplete();
    }
  };

  const Icon = currentPermission.icon;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex gap-2 mb-8">
        {permissionSteps.map((_, index) => (
          <motion.div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === currentStep
                ? "w-8 bg-primary"
                : index < currentStep
                ? "w-2 bg-primary/60"
                : "w-2 bg-muted"
            }`}
            animate={{ scale: index === currentStep ? 1 : 0.8 }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-border/50 shadow-xl">
            <CardHeader className="text-center pb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4 bg-primary/10"
              >
                <Icon className={`w-10 h-10 ${currentPermission.color}`} />
              </motion.div>
              <CardTitle className="text-xl">{currentPermission.title}</CardTitle>
              <CardDescription className="text-base mt-2">
                {currentPermission.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AnimatePresence>
                {showDeniedMessage ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {currentPermission.deniedMessage}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {currentPermission.settingsInstruction}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" onClick={handleOpenSettings}>
                        Open Settings
                      </Button>
                      <Button className="flex-1" onClick={moveToNextStep}>
                        Continue
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <Button className="w-full h-12 text-base" onClick={handleAllow}>
                      <Shield className="w-5 h-5 mr-2" />
                      Allow {currentPermission.title.split(" ")[1] || currentPermission.title}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={handleDeny}>
                      Deny
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <p className="text-sm text-muted-foreground mt-6">
        Step {currentStep + 1} of {permissionSteps.length}
      </p>
    </div>
  );
}
