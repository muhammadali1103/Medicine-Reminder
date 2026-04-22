import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Home, Users, Bell, FileText, User } from "lucide-react";

const navItems = [
  { path: "/", icon: Home, label: "Dashboard" },
  { path: "/caregiver/patients", icon: Users, label: "Patients" },
  { path: "/caregiver/notifications", icon: Bell, label: "Alerts" },
  { path: "/caregiver/reports", icon: FileText, label: "Reports" },
  { path: "/profile", icon: User, label: "Profile" },
] as const;

export function CaregiverBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || 
            (item.path === "/" && location.pathname === "/caregiver");

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "relative flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-200",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="caregiver-nav-indicator"
                  className="absolute inset-0 bg-accent rounded-2xl"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <Icon className={cn("w-5 h-5", isActive && "animate-scale-in")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
