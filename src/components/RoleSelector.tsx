import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { User, Heart, Stethoscope, ChevronRight } from "lucide-react";

export type UserRole = "patient" | "caregiver";

interface RoleSelectorProps {
  onSelect: (role: UserRole) => void;
  mode: "signup" | "login";
}

const roles = [
  {
    id: "patient" as UserRole,
    title: "Patient",
    signupDescription: "Track your medications, get reminders, and monitor your health adherence.",
    loginDescription: "Access your medication schedule and health reports.",
    icon: User,
    color: "hsl(var(--primary))",
    gradient: "from-primary/20 to-primary/5",
  },
  {
    id: "caregiver" as UserRole,
    title: "Caregiver",
    signupDescription: "Monitor your loved ones' medication adherence and receive alerts for missed doses.",
    loginDescription: "View patient reports and receive health alerts.",
    icon: Heart,
    color: "hsl(0 72% 58%)",
    gradient: "from-destructive/20 to-destructive/5",
  },
];

export function RoleSelector({ onSelect, mode }: RoleSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-foreground">
          {mode === "signup" ? "Choose Account Type" : "Login As"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "signup"
            ? "Select how you'll use the app"
            : "Select your account type to continue"}
        </p>
      </div>

      <div className="grid gap-4">
        {roles.map((role, index) => {
          const Icon = role.icon;
          return (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] border-2 border-transparent hover:border-primary/20"
                onClick={() => onSelect(role.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${role.gradient} flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className="w-7 h-7" style={{ color: role.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-foreground text-lg">
                          {role.title}
                        </h4>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {mode === "signup" ? role.signupDescription : role.loginDescription}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
