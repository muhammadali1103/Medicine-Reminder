import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icons } from "@/components/icons";
import { useCaregiverLinks, CaregiverLink } from "@/hooks/useCaregiverLinks";
import { useAuth } from "@/hooks/useAuth";
import { Heart, Users, ArrowRight, Mail, UserPlus } from "lucide-react";

export function CaregiverSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { links, loading, inviteCaregiver, acceptLink, rejectLink, removeLink } =
    useCaregiverLinks();
  const [inviteEmail, setInviteEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  const myPatientLinks = links.filter((l) => l.patient_id === user?.id);
  const myCaregiverLinks = links.filter((l) => l.caregiver_id === user?.id);
  const activeLinks = myPatientLinks.filter((l) => l.status === "active");
  const pendingInvites = myCaregiverLinks.filter((l) => l.status === "pending");
  const activeCaregiverForLinks = myCaregiverLinks.filter((l) => l.status === "active");

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    await inviteCaregiver(inviteEmail, relationship);
    setInviting(false);
    setInviteEmail("");
    setRelationship("");
    setInviteDialogOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4"
    >
      {/* Caregiver Dashboard Link for Caregivers */}
      {activeCaregiverForLinks.length > 0 && (
        <Card className="bg-gradient-to-r from-rose-500/10 to-pink-500/10 border-rose-200/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
                  <Heart className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Caregiver Dashboard</p>
                  <p className="text-xs text-muted-foreground">
                    Monitor {activeCaregiverForLinks.length} patient(s)
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => navigate("/caregiver")}>
                Open
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card variant="gradient">
        <CardHeader>
          <CardTitle className="text-primary-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Caregiver Mode
            </span>
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Invite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a Caregiver</DialogTitle>
                  <DialogDescription>
                    Enter the email address of the person you'd like to add as
                    your caregiver. They'll receive a notification and can accept
                    in their app.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="caregiver-email">Caregiver Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="caregiver-email"
                        type="email"
                        placeholder="caregiver@email.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="relationship">Relationship (Optional)</Label>
                    <Select value={relationship} onValueChange={setRelationship}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="sibling">Sibling</SelectItem>
                        <SelectItem value="friend">Friend</SelectItem>
                        <SelectItem value="nurse">Nurse</SelectItem>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                  >
                    {inviting ? "Sending..." : "Send Invitation"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-primary-foreground/80 text-sm mb-4">
            Your caregiver can monitor your medication adherence and receive
            alerts for missed doses.
          </p>

          {/* Pending Invites (for caregivers) */}
          {pendingInvites.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-primary-foreground/70 mb-2">
                Pending Invitations
              </p>
              {pendingInvites.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 bg-primary-foreground/10 rounded-xl mb-2"
                >
                  <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                    <span className="font-semibold text-primary-foreground">
                      {(link.patient_profile?.full_name || "P").charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-primary-foreground">
                      {link.patient_profile?.full_name || "Patient"}
                    </p>
                    <p className="text-xs text-primary-foreground/70">
                      Wants you as caregiver
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-success text-success-foreground hover:bg-success/90"
                      onClick={() => acceptLink(link.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => rejectLink(link.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Caregivers */}
          {activeLinks.length > 0 ? (
            <div className="space-y-2">
              {activeLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 bg-primary-foreground/10 rounded-xl"
                >
                  <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                    <span className="font-semibold text-primary-foreground">
                      {(link.caregiver_profile?.full_name || "C").charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-primary-foreground">
                      {link.caregiver_profile?.full_name || "Caregiver"}
                    </p>
                    <p className="text-xs text-primary-foreground/70">
                      Linked Caregiver
                    </p>
                  </div>
                  <Badge variant="success">Active</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    onClick={() => removeLink(link.id)}
                  >
                    <Icons.x className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-primary-foreground/60 text-sm">
                No caregivers linked yet
              </p>
              <p className="text-primary-foreground/40 text-xs mt-1">
                Invite a family member or friend to monitor your health
              </p>
            </div>
          )}

          {/* Patients I'm caring for */}
          {activeCaregiverForLinks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-primary-foreground/20">
              <p className="text-xs text-primary-foreground/70 mb-2">
                Patients You're Caring For
              </p>
              {activeCaregiverForLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 bg-primary-foreground/10 rounded-xl"
                >
                  <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                    <span className="font-semibold text-primary-foreground">
                      {(link.patient_profile?.full_name || "P").charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-primary-foreground">
                      {link.patient_profile?.full_name || "Patient"}
                    </p>
                    <p className="text-xs text-primary-foreground/70">
                      View adherence • Receive alerts
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
