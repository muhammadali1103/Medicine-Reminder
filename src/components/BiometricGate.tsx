import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BiometricUnlock } from "@/components/BiometricUnlock";
import { useAuth } from "@/hooks/useAuth";
import {
  isBiometricEnabled,
  isBiometricUnlocked,
  lockBiometricSession,
  markBiometricUnlocked,
} from "@/hooks/useBiometric";

interface BiometricGateProps {
  children: ReactNode;
}

export function BiometricGate({ children }: BiometricGateProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [passwordFallback, setPasswordFallback] = useState(false);
  const [unlocked, setUnlocked] = useState(isBiometricUnlocked());

  if (user && isBiometricEnabled() && !unlocked && !passwordFallback) {
    return (
      <BiometricUnlock
        userName={user.user_metadata?.full_name || user.email}
        onUnlocked={() => {
          markBiometricUnlocked();
          setUnlocked(true);
        }}
        onUsePassword={async () => {
          lockBiometricSession();
          setPasswordFallback(true);
          await signOut();
          navigate("/auth");
        }}
      />
    );
  }

  return <>{children}</>;
}
