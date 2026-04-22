import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { useBiometric, markBiometricPromptSkipped } from "@/hooks/useBiometric";
import { toast } from "sonner";

interface BiometricPromptProps {
  open: boolean;
  userId: string;
  userName: string;
  displayName?: string;
  onComplete: () => void;
}

export function BiometricPrompt({
  open,
  userId,
  userName,
  displayName,
  onComplete,
}: BiometricPromptProps) {
  const { registerBiometric } = useBiometric();
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const success = await registerBiometric({ userId, userName, displayName });
      if (success) {
        toast.success("Biometric unlock enabled");
        onComplete();
      } else {
        toast.error("Could not enable biometric unlock");
      }
    } catch (error) {
      console.error("Biometric registration failed:", error);
      toast.error("Biometric setup was cancelled or failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    markBiometricPromptSkipped(dontAskAgain);
    onComplete();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
            <Icons.fingerprint className="h-9 w-9 text-primary" />
          </div>
          <DialogTitle className="text-center">Enable Biometric Unlock?</DialogTitle>
          <DialogDescription className="text-center">
            Would you like to use Face ID / Fingerprint to unlock the app next time instead of your password?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button className="w-full" onClick={handleEnable} disabled={busy}>
            <Icons.fingerprint className="mr-2 h-4 w-4" />
            {busy ? "Opening biometric prompt..." : "Enable Biometric"}
          </Button>
          <Button className="w-full" variant="secondary" onClick={handleSkip} disabled={busy}>
            Not Now
          </Button>

          <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
            <Checkbox
              id="dont-ask-biometric"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <Label htmlFor="dont-ask-biometric" className="text-sm">
              Don't ask again
            </Label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
