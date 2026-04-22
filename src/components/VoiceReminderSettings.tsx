import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import { useVoiceReminder } from "@/hooks/useVoiceReminder";
import { useProfile } from "@/hooks/useProfile";

export function VoiceReminderSettings() {
  const { enabled, supported, speaking, toggleEnabled, preview, stop } = useVoiceReminder();
  const { profile } = useProfile();

  const handleToggle = (next: boolean) => {
    if (next && !supported) {
      toast.error("Voice reminders aren't supported in this browser");
      return;
    }

    const success = toggleEnabled(next);
    if (success) {
      if (next) {
        toast.success("Voice reminders activated! You'll hear spoken reminders when medications are due.");
      } else {
        toast.message("Voice reminders disabled");
      }
    }
  };

  const handlePreview = async () => {
    if (!supported) {
      toast.error("Voice playback not supported in this browser");
      return;
    }

    if (speaking) {
      stop();
      return;
    }

    const success = await preview();
    if (!success) {
      toast.error("Failed to play voice preview");
    }
  };

  const userName = profile?.full_name?.split(/\s+/)[0] || "there";
  const timezone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icons.volume className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-medium">Voice Reminders</h3>
          <p className="text-xs text-muted-foreground">
            Spoken medication reminders with personalized greetings
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between py-2">
        <div className="space-y-0.5">
          <Label htmlFor="voice-toggle">Enable voice reminders</Label>
          <p className="text-xs text-muted-foreground">
            Plays audio alerts when it's time for medication
          </p>
        </div>
        <Switch
          id="voice-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={!supported}
        />
      </div>

      {enabled && (
        <div className="space-y-3 pt-2 border-t">
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">Your reminders will include:</p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 ml-2">
              <li>Time-based greeting (morning, afternoon, evening)</li>
              <li>Your name: <span className="text-foreground font-medium">{userName}</span></li>
              <li>Medication name and dosage</li>
              <li>Health encouragement message</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icons.clock className="h-3.5 w-3.5" />
            <span>Timezone: {timezone}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePreview}
            className="w-full"
          >
            {speaking ? (
              <>
                <Icons.volumeX className="w-4 h-4 mr-2" />
                Stop Preview
              </>
            ) : (
              <>
                <Icons.volume className="w-4 h-4 mr-2" />
                Preview Voice Reminder
              </>
            )}
          </Button>
        </div>
      )}

      {!supported && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs">
          <Icons.alertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Voice reminders are not supported in this browser. Try using Chrome, Safari, or Edge for full compatibility.
          </p>
        </div>
      )}
    </div>
  );
}
