import { useCallback, useEffect, useState } from "react";

const ENABLED_KEY = "biometric_enabled";
const DONT_ASK_KEY = "biometric_dont_ask";
const CREDENTIAL_KEY = "biometric_credential";
const UNLOCKED_KEY = "biometric_unlocked_session";

interface StoredBiometricCredential {
  credentialId: string;
  userId: string;
  userName: string;
  createdAt: string;
}

interface RegisterOptions {
  userId: string;
  userName: string;
  displayName?: string;
}

function randomChallenge() {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

function stringToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function readCredential(): StoredBiometricCredential | null {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? (JSON.parse(raw) as StoredBiometricCredential) : null;
  } catch {
    return null;
  }
}

export function checkBiometricSupport() {
  return Boolean(
    typeof window !== "undefined" &&
      window.PublicKeyCredential &&
      navigator.credentials &&
      window.isSecureContext
  );
}

export function isBiometricEnabled() {
  return localStorage.getItem(ENABLED_KEY) === "true" && Boolean(readCredential());
}

export function shouldAskForBiometric() {
  return (
    checkBiometricSupport() &&
    localStorage.getItem(DONT_ASK_KEY) !== "true" &&
    localStorage.getItem(ENABLED_KEY) !== "false" &&
    !readCredential()
  );
}

export function markBiometricPromptSkipped(dontAskAgain: boolean) {
  localStorage.setItem(ENABLED_KEY, "false");
  if (dontAskAgain) {
    localStorage.setItem(DONT_ASK_KEY, "true");
  }
}

export function markBiometricUnlocked() {
  sessionStorage.setItem(UNLOCKED_KEY, "true");
}

export function isBiometricUnlocked() {
  return sessionStorage.getItem(UNLOCKED_KEY) === "true";
}

export function lockBiometricSession() {
  sessionStorage.removeItem(UNLOCKED_KEY);
}

export function useBiometric() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [credential, setCredential] = useState<StoredBiometricCredential | null>(null);

  const refreshState = useCallback(() => {
    const nextCredential = readCredential();
    setSupported(checkBiometricSupport());
    setCredential(nextCredential);
    setEnabled(localStorage.getItem(ENABLED_KEY) === "true" && Boolean(nextCredential));
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const registerBiometric = useCallback(
    async ({ userId, userName, displayName }: RegisterOptions) => {
      if (!checkBiometricSupport()) {
        return false;
      }

      const createdCredential = await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge(),
          rp: {
            name: "Smart Medicine Reminder",
          },
          user: {
            id: stringToBytes(userId),
            name: userName,
            displayName: displayName || userName,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      });

      if (!createdCredential || createdCredential.type !== "public-key") {
        return false;
      }

      const publicKeyCredential = createdCredential as PublicKeyCredential;
      const stored: StoredBiometricCredential = {
        credentialId: bufferToBase64Url(publicKeyCredential.rawId),
        userId,
        userName,
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(stored));
      localStorage.setItem(ENABLED_KEY, "true");
      localStorage.setItem(DONT_ASK_KEY, "true");
      markBiometricUnlocked();
      refreshState();
      return true;
    },
    [refreshState]
  );

  const authenticateWithBiometric = useCallback(async () => {
    const stored = readCredential();
    if (!checkBiometricSupport() || !stored) {
      return false;
    }

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [
          {
            id: base64UrlToBuffer(stored.credentialId),
            type: "public-key",
            transports: ["internal"],
          },
        ],
        userVerification: "preferred",
        timeout: 60000,
      },
    });

    if (!assertion) {
      return false;
    }

    markBiometricUnlocked();
    return true;
  }, []);

  const clearBiometric = useCallback(() => {
    localStorage.removeItem(CREDENTIAL_KEY);
    localStorage.setItem(ENABLED_KEY, "false");
    sessionStorage.removeItem(UNLOCKED_KEY);
    refreshState();
  }, [refreshState]);

  return {
    supported,
    enabled,
    credential,
    checkBiometricSupport,
    registerBiometric,
    authenticateWithBiometric,
    clearBiometric,
    refreshState,
  };
}
