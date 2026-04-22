import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { VoiceReminderSettings } from "@/components/VoiceReminderSettings";
import { PermissionsStatusPanel } from "@/components/PermissionsStatusPanel";
import { BiometricSecuritySettings } from "@/components/BiometricSecuritySettings";

const themeColors = [
  {
    name: "teal",
    label: "Calm Teal",
    description: "Clean medical teal with aqua glow",
    gradient: "linear-gradient(135deg, hsl(174 62% 42%) 0%, hsl(190 72% 50%) 100%)",
  },
  {
    name: "ocean",
    label: "Ocean Blue",
    description: "Fresh blue with bright cyan depth",
    gradient: "linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(192 92% 55%) 100%)",
  },
  {
    name: "sunset",
    label: "Sunset Glow",
    description: "Warm coral fading into pink",
    gradient: "linear-gradient(135deg, hsl(18 92% 57%) 0%, hsl(340 88% 64%) 100%)",
  },
  {
    name: "rose",
    label: "Rose Burst",
    description: "Confident rose with soft peach light",
    gradient: "linear-gradient(135deg, hsl(338 82% 55%) 0%, hsl(12 92% 64%) 100%)",
  },
  {
    name: "emerald",
    label: "Emerald Mist",
    description: "Green with a cool mint finish",
    gradient: "linear-gradient(135deg, hsl(152 66% 42%) 0%, hsl(172 74% 46%) 100%)",
  },
  {
    name: "amber",
    label: "Amber Flame",
    description: "Golden amber with lively warmth",
    gradient: "linear-gradient(135deg, hsl(35 94% 53%) 0%, hsl(14 96% 62%) 100%)",
  },
  {
    name: "violet",
    label: "Violet Pop",
    description: "Electric violet with magenta glow",
    gradient: "linear-gradient(135deg, hsl(262 83% 58%) 0%, hsl(302 76% 62%) 100%)",
  },
] as const;

export function AppSettings() {
  const { isDark, toggleDark, themeColor, setThemeColor } = useTheme();
  const [resetting, setResetting] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const updateScrollState = () => {
    const element = scrollContainerRef.current;
    if (!element) return;

    setCanScrollUp(element.scrollTop > 8);
    setCanScrollDown(element.scrollTop + element.clientHeight < element.scrollHeight - 8);
  };

  useEffect(() => {
    updateScrollState();
  }, []);

  const scrollSettings = (direction: "up" | "down") => {
    const element = scrollContainerRef.current;
    if (!element) return;

    element.scrollBy({
      top: direction === "down" ? 260 : -260,
      behavior: "smooth",
    });
  };

  const handleResetPassword = async () => {
    setResetting(true);
    try {
      const { data } = await apiClient.auth.getSession();
      const email = data.session?.user?.email;

      if (!email) {
        toast.error("Unable to find your email");
        setResetting(false);
        return;
      }

      const { error } = await apiClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error("Failed to send reset email");
      } else {
        toast.success("Password reset email sent! Check your inbox.");
      }
    } catch {
      toast.error("An error occurred");
    }
    setResetting(false);
  };

  return (
    <div className="relative">
      {/* Permissions Status Panel */}
      <div
        ref={scrollContainerRef}
        onScroll={updateScrollState}
        className="max-h-[62vh] space-y-6 overflow-y-auto pr-2 scroll-smooth"
      >
        <PermissionsStatusPanel />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Icons.settings className="w-4 h-4 text-primary" />
              App Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dark Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Switch between light and dark theme
                </p>
              </div>
              <Switch checked={isDark} onCheckedChange={toggleDark} />
            </div>

            {/* Theme Colors */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Theme Style</Label>
                <p className="text-xs text-muted-foreground">
                  Pick a richer accent palette with an attractive gradient look
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {themeColors.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => setThemeColor(color.name)}
                    className={`rounded-2xl border p-3 text-left transition-all ${
                      themeColor === color.name
                        ? "border-primary shadow-glow scale-[1.02]"
                        : "border-border hover:border-primary/40 hover:scale-[1.01]"
                    }`}
                    title={color.label}
                  >
                    <div
                      className="h-16 w-full rounded-xl shadow-sm"
                      style={{ background: color.gradient }}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{color.label}</p>
                        <p className="text-xs text-muted-foreground">{color.description}</p>
                      </div>
                      {themeColor === color.name && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Icons.check className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Preview
                </p>
                <div className="mt-3 rounded-2xl p-4 text-primary-foreground shadow-lg" style={{ background: "var(--gradient-primary)" }}>
                  <p className="text-sm font-semibold">Smart Medicine Reminder</p>
                  <p className="text-xs text-primary-foreground/80">
                    Your selected palette updates buttons, highlights, and hero gradients across the app.
                  </p>
                </div>
              </div>
            </div>

            {/* Voice reminders */}
            <div className="pt-4 border-t border-border">
              <VoiceReminderSettings />
            </div>

            {/* Security */}
            <div className="pt-4 border-t border-border">
              <BiometricSecuritySettings />
            </div>

            {/* Reset Password */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="space-y-0.5">
                <Label>Reset Password</Label>
                <p className="text-xs text-muted-foreground">
                  Send a password reset link to your email
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResetPassword}
                disabled={resetting}
              >
                <Icons.lock className="w-4 h-4 mr-2" />
                {resetting ? "Sending..." : "Reset Password"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={`pointer-events-auto rounded-full bg-background/90 shadow-md ${!canScrollUp ? "opacity-40" : ""}`}
          onClick={() => scrollSettings("up")}
          disabled={!canScrollUp}
          aria-label="Scroll up settings"
        >
          <Icons.chevronRight className="h-4 w-4 -rotate-90" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={`pointer-events-auto rounded-full bg-background/90 shadow-md ${!canScrollDown ? "opacity-40" : ""}`}
          onClick={() => scrollSettings("down")}
          disabled={!canScrollDown}
          aria-label="Scroll down settings"
        >
          <Icons.chevronRight className="h-4 w-4 rotate-90" />
        </Button>
      </div>
    </div>
  );
}
