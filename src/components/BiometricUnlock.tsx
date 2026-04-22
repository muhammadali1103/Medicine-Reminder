import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PillIcon } from "@/components/PillIcon";
import { Icons } from "@/components/icons";
import { useBiometric } from "@/hooks/useBiometric";

interface BiometricUnlockProps {
  userName?: string | null;
  onUnlocked: () => void;
  onUsePassword: () => void;
}

export function BiometricUnlock({ userName, onUnlocked, onUsePassword }: BiometricUnlockProps) {
  const { authenticateWithBiometric } = useBiometric();
  const [attempts, setAttempts] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const firstName = userName?.split(/\s+/)[0] || "there";

  const unlock = async () => {
    if (unlocking) return;

    setUnlocking(true);
    try {
      const success = await authenticateWithBiometric();
      if (success) {
        onUnlocked();
        return;
      }

      setAttempts((current) => current + 1);
    } catch (error) {
      console.error("Biometric authentication failed:", error);
      setAttempts((current) => current + 1);
    } finally {
      setUnlocking(false);
    }
  };

  useEffect(() => {
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (attempts >= 3) {
      onUsePassword();
    }
  }, [attempts, onUsePassword]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-lg shadow-primary/25">
            <PillIcon className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Smart Medicine Reminder</h1>
        </div>

        <button
          type="button"
          onClick={unlock}
          disabled={unlocking}
          className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-glow transition-transform hover:scale-105 disabled:opacity-70"
        >
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Icons.fingerprint className="h-20 w-20" />
          </motion.div>
        </button>

        <h2 className="mt-8 text-xl font-bold text-foreground">Welcome back, {firstName}</h2>
        <p className="mt-2 text-muted-foreground">
          {unlocking ? "Waiting for Face ID / Fingerprint..." : "Tap to unlock"}
        </p>

        {attempts > 0 && (
          <p className="mt-3 text-sm text-destructive">
            Biometric unlock failed. Attempt {attempts} of 3.
          </p>
        )}

        <Button variant="link" className="mt-8" onClick={onUsePassword}>
          Use password instead
        </Button>
      </motion.div>
    </div>
  );
}
