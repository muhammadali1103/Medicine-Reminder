import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Icons } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import { useBiometric } from "@/hooks/useBiometric";
import { toast } from "sonner";

export function BiometricSecuritySettings() {
  const { user } = useAuth();
  const {
    supported,
    enabled,
    credential,
    registerBiometric,
    authenticateWithBiometric,
    clearBiometric,
    refreshState,
  } = useBiometric();
  const [busy, setBusy] = useState(false);

  if (!supported) {
    return null;
  }

  const handleToggle = async (next: boolean) => {
    if (!user) return;

    if (!next) {
      clearBiometric();
      toast.message("Biometric unlock disabled");
      return;
    }

    setBusy(true);
    try {
      const success = await registerBiometric({
        userId: user.id,
        userName: user.email,
        displayName: user.user_metadata?.full_name || user.email,
      });
      if (success) {
        toast.success("Biometric unlock enabled");
      }
    } catch (error) {
      console.error("Biometric setup failed:", error);
      toast.error("Biometric setup failed or was cancelled");
    } finally {
      setBusy(false);
      refreshState();
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const success = await authenticateWithBiometric();
      if (success) {
        toast.success("Biometric unlock verified");
      } else {
        toast.error("Biometric verification failed");
      }
    } catch (error) {
      console.error("Biometric test failed:", error);
      toast.error("Biometric verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Icons.fingerprint className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-medium">Security</h3>
          <p className="text-xs text-muted-foreground">
            {enabled ? "Face ID enabled" : "Not enabled"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between py-2">
        <div className="space-y-0.5">
          <Label htmlFor="biometric-unlock-toggle">Biometric Unlock</Label>
          <p className="text-xs text-muted-foreground">
            Use Face ID, fingerprint, or device passkey to unlock this app.
          </p>
        </div>
        <Switch
          id="biometric-unlock-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={busy}
        />
      </div>

      {enabled && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Credential created {credential?.createdAt ? new Date(credential.createdAt).toLocaleDateString() : "recently"}.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={handleTest} disabled={busy}>
            <Icons.fingerprint className="mr-2 h-4 w-4" />
            Test Biometric
          </Button>
        </div>
      )}
    </div>
  );
}
