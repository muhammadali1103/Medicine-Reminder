import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { useProfile } from "@/hooks/useProfile";
import { BiometricSecuritySettings } from "@/components/BiometricSecuritySettings";

export function PrivacySettings() {
  const { profile, updateProfile } = useProfile();

  const handleToggleDataSharing = async () => {
    if (profile) {
      await updateProfile({
        consent_data_sharing: !profile.consent_data_sharing,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icons.shield className="w-4 h-4 text-primary" />
          Privacy & Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="data-sharing">Anonymous Data Sharing</Label>
            <p className="text-xs text-muted-foreground">
              Help improve the app with anonymous usage data
            </p>
          </div>
          <Switch
            id="data-sharing"
            checked={profile?.consent_data_sharing ?? false}
            onCheckedChange={handleToggleDataSharing}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Two-Factor Authentication</Label>
            <p className="text-xs text-muted-foreground">
              Add extra security to your account
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Coming Soon</span>
        </div>

        <BiometricSecuritySettings />

        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Your health data is encrypted and stored securely. We never sell
            your personal information.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
