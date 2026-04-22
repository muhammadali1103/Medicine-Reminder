import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Bell, MapPin, AlertTriangle, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

interface PermissionStatus {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "enabled" | "disabled" | "unknown";
  color: string;
}

export function PermissionsStatusPanel() {
  const [permissions, setPermissions] = useState<PermissionStatus[]>([
    {
      id: "notifications",
      label: "In-App Alerts",
      icon: Bell,
      status: "unknown",
      color: "hsl(var(--primary))",
    },
    {
      id: "location",
      label: "Location",
      icon: MapPin,
      status: "unknown",
      color: "hsl(152 60% 45%)",
    },
  ]);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const updatedPermissions = [...permissions];
    const popupSetting = localStorage.getItem("permission_notifications");
    updatedPermissions[0].status = popupSetting === "denied" ? "disabled" : "enabled";

    if ("permissions" in navigator) {
      try {
        const locPerm = await navigator.permissions.query({ name: "geolocation" });
        updatedPermissions[1].status = locPerm.state === "granted" ? "enabled" : "disabled";
      } catch {
        const stored = localStorage.getItem("permission_location");
        updatedPermissions[1].status = stored === "granted" ? "enabled" : "disabled";
      }
    }

    setPermissions(updatedPermissions);
  };

  const handleOpenSettings = () => {
    window.open("app-settings:", "_self");
  };

  const getStatusIcon = (status: "enabled" | "disabled" | "unknown") => {
    switch (status) {
      case "enabled":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "disabled":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: "enabled" | "disabled" | "unknown") => {
    switch (status) {
      case "enabled":
        return <Badge variant="success">Enabled</Badge>;
      case "disabled":
        return <Badge variant="destructive">Disabled</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icons.shield className="w-4 h-4 text-primary" />
          Permissions Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissions.map((permission, index) => {
          const Icon = permission.icon;
          return (
            <motion.div
              key={permission.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-3 rounded-xl bg-accent/50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${permission.color}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: permission.color }} />
                </div>
                <span className="font-medium text-foreground">{permission.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(permission.status)}
                {getStatusBadge(permission.status)}
              </div>
            </motion.div>
          );
        })}

        <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 mt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Built-in reminder mode
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Popup reminders work inside the app while it is open. SMS reminder permissions are no longer used.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={checkPermissions}>
            <Icons.clock className="w-4 h-4 mr-2" />
            Refresh Status
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleOpenSettings}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
