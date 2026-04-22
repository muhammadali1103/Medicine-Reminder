import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MedicationCard, Medication } from "@/components/MedicationCard";
import { TakenConfirmationModal } from "@/components/TakenConfirmationModal";
import { DrugInteractionBanner } from "@/components/DrugInteractionBanner";
import { DrugInteractionModal } from "@/components/DrugInteractionModal";
import { BottomNav } from "@/components/BottomNav";
import { Icons } from "@/components/icons";
import { useNavigate } from "react-router-dom";
import { useMedications, MedicationData } from "@/hooks/useMedications";
import { useDrugInteractions } from "@/hooks/useDrugInteractions";
import { useDoseLogging } from "@/hooks/useDoseLogging";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type FilterType = "all" | "active" | "paused";

export default function Medications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { medications, loading, lastSyncedLabel, deleteMedication, updateMedication, toggleMedicationStatus } = useMedications();
  const { logDose, getDoseLogs } = useDoseLogging();
  const [filter, setFilter] = useState<FilterType>("all");
  const [editingMedication, setEditingMedication] = useState<MedicationData | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    generic_name: "",
    strength: "",
    dosage: "",
    frequency: "once",
    time: "08:00",
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // Taken confirmation modal state
  const [confirmingMedication, setConfirmingMedication] = useState<MedicationData | null>(null);
  const [lastTakenTimes, setLastTakenTimes] = useState<Record<string, Date | null>>({});

  // Interaction details modal state
  const [interactionModalOpen, setInteractionModalOpen] = useState(false);
  const [interactionModalTitle, setInteractionModalTitle] = useState("Drug Interaction Details");
  const [selectedInteractions, setSelectedInteractions] = useState<
    ReturnType<typeof useDrugInteractions>["interactions"]
  >([]);
  const {
    interactions,
    loading: interactionsLoading,
    error: interactionError,
  } = useDrugInteractions(
    medications.map((med) => ({
      id: med.id,
      name: med.name,
      genericName: med.generic_name,
      strength: med.strength,
      dosage: med.dosage,
      isActive: med.is_active,
    }))
  );

  const interactionCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const med of medications) {
      counts[med.id] = interactions.filter((interaction) =>
        interaction.medicationIds.includes(med.id)
      ).length;
    }

    return counts;
  }, [interactions, medications]);

  const severeInteractionCount = useMemo(
    () => interactions.filter((interaction) => interaction.severity === "high").length,
    [interactions]
  );

  // Fetch last taken times for all medications
  useEffect(() => {
    const fetchMedicationDetails = async () => {
      if (!user || medications.length === 0) return;

      // Fetch last taken times
      const times: Record<string, Date | null> = {};
      for (const med of medications) {
        const logs = await getDoseLogs(med.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
        const takenLog = logs.find(l => l.status === "taken" || l.status === "late");
        times[med.id] = takenLog?.taken_time ? new Date(takenLog.taken_time) : null;
      }
      setLastTakenTimes(times);
    };

    fetchMedicationDetails();
  }, [user, medications, getDoseLogs]);

  const transformMedication = (med: MedicationData): Medication => {
    const schedule = med.schedule;
    const frequencyMap: Record<string, string> = {
      once: "Once daily",
      twice: "Twice daily",
      three: "Three times daily",
      weekly: "Weekly",
      prn: "As needed",
    };

    return {
      id: med.id,
      name: med.name,
      genericName: med.generic_name || undefined,
      strength: med.strength || undefined,
      dosage: med.dosage || "1 tablet",
      frequency: frequencyMap[schedule?.frequency || "once"] || "Once daily",
      nextDose: getNextDoseTime(schedule?.times?.[0]),
      shape: (med.shape as "round" | "oval" | "capsule" | "tablet") || "round",
      color1: med.color || "#4CAF50",
      color2: lightenColor(med.color || "#4CAF50"),
      status: med.is_active ? "active" : "paused",
    };
  };

  const getNextDoseTime = (time?: string): string | undefined => {
    if (!time) return undefined;
    const now = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    const doseTime = new Date();
    doseTime.setHours(hours, minutes, 0, 0);

    if (doseTime > now) {
      return `Today, ${formatTime(time)}`;
    } else {
      return `Tomorrow, ${formatTime(time)}`;
    }
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const lightenColor = (hex: string): string => {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = 40;
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
  };

  const handleEdit = (med: MedicationData) => {
    setEditingMedication(med);
    setEditForm({
      name: med.name,
      generic_name: med.generic_name || "",
      strength: med.strength || "",
      dosage: med.dosage || "1 tablet",
      frequency: med.schedule?.frequency || "once",
      time: med.schedule?.times?.[0] || "08:00",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMedication) return;
    
    if (!editForm.name.trim()) {
      toast.error("Medication name is required");
      return;
    }

    setIsSaving(true);
    try {
      const success = await updateMedication(editingMedication.id, {
        name: editForm.name.trim(),
        generic_name: editForm.generic_name.trim() || null,
        strength: editForm.strength.trim() || null,
        dosage: editForm.dosage.trim() || null,
        schedule: {
          type: editForm.frequency === "weekly" ? "weekly" : "daily",
          times: [editForm.time],
          frequency: editForm.frequency,
        },
      });

      if (success) {
        setEditingMedication(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTakenClick = (med: MedicationData) => {
    // Open confirmation modal instead of directly logging
    setConfirmingMedication(med);
  };

  const handleConfirmTaken = async () => {
    if (!confirmingMedication) return;
    
    const schedule = confirmingMedication.schedule;
    const time = schedule?.times?.[0] || "08:00";
    const [hours, minutes] = time.split(":").map(Number);
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    const result = await logDose(confirmingMedication.id, scheduledTime, "taken");
    if (result) {
      toast.success(`Marked ${confirmingMedication.name} as taken`);
      // Update last taken time
      setLastTakenTimes(prev => ({
        ...prev,
        [confirmingMedication.id]: new Date(),
      }));
    }
    setConfirmingMedication(null);
  };

  const handleInteractionClick = (med: MedicationData) => {
    const medInteractions = interactions.filter((interaction) =>
      interaction.medicationIds.includes(med.id)
    );

    if (medInteractions.length > 0) {
      setInteractionModalTitle(`${med.name} interactions`);
      setSelectedInteractions(medInteractions);
      setInteractionModalOpen(true);
    } else {
      toast.info("No interaction details available for this medication");
    }
  };

  const handleSkip = async (med: MedicationData) => {
    const schedule = med.schedule;
    const time = schedule?.times?.[0] || "08:00";
    const [hours, minutes] = time.split(":").map(Number);
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    const result = await logDose(med.id, scheduledTime, "skipped");
    if (result) {
      toast.info(`Skipped ${med.name}`);
    }
  };

  const filteredMedications = medications.filter((med) => {
    if (filter === "all") return true;
    if (filter === "active") return med.is_active;
    return !med.is_active;
  });

  const counts = {
    all: medications.length,
    active: medications.filter((m) => m.is_active).length,
    paused: medications.filter((m) => !m.is_active).length,
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">My Medications</h1>
              <p className="text-xs text-muted-foreground">{lastSyncedLabel}</p>
            </div>
            <Button size="icon-sm" onClick={() => navigate("/add-medication")}>
              <Icons.plus className="w-5 h-5" />
            </Button>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4">
            {(["all", "active", "paused"] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "secondary"}
                size="sm"
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
                <Badge
                  variant={filter === f ? "secondary" : "outline"}
                  className="ml-1.5 px-1.5 py-0 text-[10px]"
                >
                  {counts[f]}
                </Badge>
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        <div className="space-y-4">
          <DrugInteractionBanner
            interactionCount={interactions.length}
            severeCount={severeInteractionCount}
            error={interactionError}
            loading={interactionsLoading}
            onOpenDetails={
              interactions.length > 0
                ? () => {
                    setInteractionModalTitle("Drug Interaction Details");
                    setSelectedInteractions(interactions);
                    setInteractionModalOpen(true);
                  }
                : undefined
            }
          />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full"
              />
            </div>
          ) : filteredMedications.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Icons.pill className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No medications found</h3>
              <p className="text-muted-foreground mb-4">
                {filter === "all"
                  ? "Add your first medication to get started"
                  : `No ${filter} medications`}
              </p>
              <Button onClick={() => navigate("/add-medication")}>
                <Icons.plus className="w-4 h-4" />
                Add Medication
              </Button>
            </motion.div>
          ) : (
            <AnimatePresence>
              {filteredMedications.map((med, index) => (
                <motion.div
                  key={med.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <MedicationCard
                    medication={{
                      ...transformMedication(med),
                      interactions: interactionCounts[med.id] || 0,
                    }}
                    variant="full"
                    onTaken={() => handleTakenClick(med)}
                    onSkip={() => handleSkip(med)}
                    onEdit={() => handleEdit(med)}
                    onDelete={() => deleteMedication(med.id)}
                    onToggleStatus={() => toggleMedicationStatus(med.id)}
                    onInteractionClick={() => handleInteractionClick(med)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Edit Sheet */}
      <Sheet open={!!editingMedication} onOpenChange={(open) => !open && setEditingMedication(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Edit Medication</SheetTitle>
            <SheetDescription>
              Update the details for {editingMedication?.name}
            </SheetDescription>
          </SheetHeader>
          
          <div className="space-y-4 mt-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Medication Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="e.g., Metformin"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-generic">Generic Name</Label>
              <Input
                id="edit-generic"
                value={editForm.generic_name}
                onChange={(e) => setEditForm({ ...editForm, generic_name: e.target.value })}
                placeholder="e.g., Metformin HCl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-strength">Strength</Label>
                <Input
                  id="edit-strength"
                  value={editForm.strength}
                  onChange={(e) => setEditForm({ ...editForm, strength: e.target.value })}
                  placeholder="e.g., 500mg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dosage">Dosage</Label>
                <Input
                  id="edit-dosage"
                  value={editForm.dosage}
                  onChange={(e) => setEditForm({ ...editForm, dosage: e.target.value })}
                  placeholder="e.g., 1 tablet"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={editForm.frequency} onValueChange={(v) => setEditForm({ ...editForm, frequency: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once daily</SelectItem>
                  <SelectItem value="twice">Twice daily</SelectItem>
                  <SelectItem value="three">Three times daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="prn">As needed (PRN)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-time">Reminder Time</Label>
              <Input
                id="edit-time"
                type="time"
                value={editForm.time}
                onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setEditingMedication(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Taken Confirmation Modal */}
      <TakenConfirmationModal
        open={!!confirmingMedication}
        onOpenChange={(open) => !open && setConfirmingMedication(null)}
        medicationName={confirmingMedication?.name || ""}
        dosage={confirmingMedication?.dosage || "1 tablet"}
        strength={confirmingMedication?.strength || undefined}
        lastTakenTime={confirmingMedication ? lastTakenTimes[confirmingMedication.id] : null}
        minIntervalHours={4}
        onConfirm={handleConfirmTaken}
      />

      {/* Interaction Details Modal */}
      <DrugInteractionModal
        open={interactionModalOpen}
        onOpenChange={(open) => {
          setInteractionModalOpen(open);
          if (!open) {
            setSelectedInteractions([]);
          }
        }}
        interactions={selectedInteractions}
        title={interactionModalTitle}
      />

      <BottomNav />
    </div>
  );
}
