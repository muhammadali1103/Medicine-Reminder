import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { toast } from "sonner";

interface VoiceReminderPreviewProps {
  medicationName: string;
  dosage?: string;
  time?: string;
  disabled?: boolean;
}

export function VoiceReminderPreview({
  medicationName,
  dosage,
  time,
  disabled,
}: VoiceReminderPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePreview = async () => {
    if (!("speechSynthesis" in window)) {
      toast.error("Voice preview not supported in this browser");
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);

    const timeText = time ? `at ${time}` : "now";
    const dosageText = dosage ? `, ${dosage}` : "";
    const message = `Time to take your ${medicationName}${dosageText} ${timeText}. Please take your medication and confirm when done.`;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to use a friendly voice (voices can load async in some browsers)
    const getVoices = () => window.speechSynthesis.getVoices();
    let voices = getVoices();

    if (!voices.length) {
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, 800);
        window.speechSynthesis.onvoiceschanged = () => {
          window.clearTimeout(id);
          resolve();
        };
      });
      voices = getVoices();
    }

    const englishVoice =
      voices.find((v) => v.lang.startsWith("en") && /female/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en"));

    if (englishVoice) utterance.voice = englishVoice;

    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      toast.error("Failed to play voice preview");
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handlePreview}
      disabled={disabled}
      className="gap-2"
    >
      {isPlaying ? (
        <>
          <Icons.stop className="w-4 h-4" />
          Stop
        </>
      ) : (
        <>
          <Icons.volume className="w-4 h-4" />
          Preview Voice
        </>
      )}
    </Button>
  );
}
