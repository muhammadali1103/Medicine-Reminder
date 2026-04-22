import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/icons";

const navItems = [
  { path: "/", icon: "home", label: "Home" },
  { path: "/medications", icon: "pill", label: "Meds" },
  { path: "/emergency-card", icon: "shield", label: "Card" },
  { path: "/reports", icon: "trending", label: "Reports" },
  { path: "/profile", icon: "users", label: "Profile" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const Icon = Icons[item.icon as keyof typeof Icons];
          const isActive = location.pathname === item.path;

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
                  layoutId="nav-indicator"
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
