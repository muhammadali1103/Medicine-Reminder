import { useCallback, useEffect, useRef, useState } from "react";
import { useProfile } from "@/hooks/useProfile";

const STORAGE_KEY = "smrai.voiceReminders.enabled";

interface VoiceReminderOptions {
  medicationName: string;
  dosage?: string;
}

function getGreeting(timezone: string | null): string {
  const now = new Date();
  let hours = now.getHours();

  // Adjust for timezone if provided
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone,
      });
      hours = parseInt(formatter.format(now), 10);
    } catch (e) {
      console.warn("Invalid timezone, using local time:", e);
    }
  }

  if (hours >= 5 && hours < 12) {
    return "Good morning";
  } else if (hours >= 12 && hours < 17) {
    return "Good afternoon";
  } else if (hours >= 17 && hours < 21) {
    return "Good evening";
  } else {
    return "Hello";
  }
}

function getUserFirstName(fullName: string | null): string {
  if (!fullName) return "";
  const firstName = fullName.trim().split(/\s+/)[0];
  return firstName;
}

function buildReminderMessage(
  greeting: string,
  userName: string,
  medicationName: string,
  dosage?: string
): string {
  const nameSection = userName ? `, ${userName}` : "";
  const dosageSection = dosage ? `, ${dosage}` : "";

  return `${greeting}${nameSection}. Your medicine time has arrived. Please take ${medicationName}${dosageSection} now.`;
}

// Get the best available voice (prefer female English voices for clarity)
async function getBestVoice(): Promise<SpeechSynthesisVoice | null> {
  if (!("speechSynthesis" in window)) return null;

  const getVoices = () => window.speechSynthesis.getVoices();
  let voices = getVoices();

  // Wait for voices to load if needed
  if (!voices.length) {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 1000);
      window.speechSynthesis.onvoiceschanged = () => {
        window.clearTimeout(timeout);
        resolve();
      };
    });
    voices = getVoices();
  }

  if (!voices.length) return null;

  // Priority order for voice selection
  const preferredVoices = [
    // Premium voices (usually sound more natural)
    (v: SpeechSynthesisVoice) => v.name.includes("Google") && v.lang.startsWith("en") && /female/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.name.includes("Google") && v.lang.startsWith("en"),
    (v: SpeechSynthesisVoice) => v.name.includes("Microsoft") && v.lang.startsWith("en") && /female|zira|hazel|susan/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.name.includes("Microsoft") && v.lang.startsWith("en"),
    (v: SpeechSynthesisVoice) => v.name.includes("Samantha") && v.lang.startsWith("en"), // iOS
    (v: SpeechSynthesisVoice) => v.name.includes("Karen") && v.lang.startsWith("en"), // iOS Australian
    (v: SpeechSynthesisVoice) => v.lang.startsWith("en") && /female|woman/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.lang.startsWith("en-US"),
    (v: SpeechSynthesisVoice) => v.lang.startsWith("en-GB"),
    (v: SpeechSynthesisVoice) => v.lang.startsWith("en"),
  ];

  for (const matcher of preferredVoices) {
    const match = voices.find(matcher);
    if (match) return match;
  }

  return voices[0];
}

export function useVoiceReminder() {
  const { profile } = useProfile();
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check support and load preference
  useEffect(() => {
    const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(isSupported);

    if (isSupported) {
      const saved = localStorage.getItem(STORAGE_KEY);
      setEnabled(saved === "true");
    }
  }, []);

  const toggleEnabled = useCallback((value: boolean) => {
    if (value && !supported) {
      return false;
    }
    setEnabled(value);
    localStorage.setItem(STORAGE_KEY, String(value));
    return true;
  }, [supported]);

  const speak = useCallback(
    async (options: VoiceReminderOptions): Promise<boolean> => {
      if (!supported || !enabled) return false;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const greeting = getGreeting(profile?.timezone ?? null);
      const userName = getUserFirstName(profile?.full_name ?? null);
      const message = buildReminderMessage(
        greeting,
        userName,
        options.medicationName,
        options.dosage
      );

      const utterance = new SpeechSynthesisUtterance(message);
      utteranceRef.current = utterance;

      // Configure speech parameters for a pleasant, clear voice
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1.05; // Slightly higher for warmth
      utterance.volume = 1;

      // Get the best voice
      const voice = await getBestVoice();
      if (voice) {
        utterance.voice = voice;
      }

      return new Promise((resolve) => {
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => {
          setSpeaking(false);
          resolve(true);
        };
        utterance.onerror = (e) => {
          console.error("Voice reminder error:", e);
          setSpeaking(false);
          resolve(false);
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [supported, enabled, profile?.timezone, profile?.full_name]
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, []);

  const preview = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const greeting = getGreeting(profile?.timezone ?? null);
    const userName = getUserFirstName(profile?.full_name ?? null);
    const message = buildReminderMessage(
      greeting,
      userName,
      "Aspirin",
      "100mg"
    );

    const utterance = new SpeechSynthesisUtterance(message);
    utteranceRef.current = utterance;

    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.volume = 1;

    const voice = await getBestVoice();
    if (voice) {
      utterance.voice = voice;
    }

    return new Promise((resolve) => {
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        resolve(true);
      };
      utterance.onerror = (e) => {
        console.error("Voice preview error:", e);
        setSpeaking(false);
        resolve(false);
      };

      window.speechSynthesis.speak(utterance);
    });
  }, [supported, profile?.timezone, profile?.full_name]);

  return {
    enabled,
    supported,
    speaking,
    toggleEnabled,
    speak,
    stop,
    preview,
  };
}
