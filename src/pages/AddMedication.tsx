import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddMedicationOptions, CameraScanView, PillIdentificationResult } from "@/components/AddMedicationOptions";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useMedications } from "@/hooks/useMedications";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cacheKey, readCachedData, writeCachedData } from "@/services/offlineCache";
import { enqueueSyncAction } from "@/services/syncQueue";
import { checkDrugInteractions } from "@/services/drugInteractions";
import { MedicationScanner } from "@/components/MedicationScanner";
import { QRScanner } from "@/components/QRScanner";

type Step = "select" | "scan" | "barcode" | "ocr" | "details" | "schedule" | "confirm";

const medicationSchema = z.object({
  name: z.string().min(1, "Medication name is required").max(200, "Name is too long"),
  genericName: z.string().max(200).optional(),
  strength: z.string().max(50).optional(),
  dosage: z.string().max(100).optional(),
  form: z.string().optional(),
  shape: z.string().optional(),
  color: z.string().optional(),
  instructions: z.string().max(500).optional(),
});

interface MedicationForm {
  name: string;
  genericName: string;
  strength: string;
  dosage: string;
  form: string;
  frequency: string;
  timesPerDay: number;
  timeSlots: { morning: boolean; afternoon: boolean; evening: boolean };
  times: string[];
  shape: string;
  color: string;
  instructions: string;
  imprint: string;
  startDate: string;
  durationDays: number;
}

const getTimesFromSlots = (slots: { morning: boolean; afternoon: boolean; evening: boolean }): string[] => {
  const times: string[] = [];
  if (slots.morning) times.push("08:00");
  if (slots.afternoon) times.push("14:00");
  if (slots.evening) times.push("20:00");
  return times.length > 0 ? times : ["08:00"];
};

const initialForm: MedicationForm = {
  name: "",
  genericName: "",
  strength: "",
  dosage: "1 tablet",
  form: "tablet",
  frequency: "once",
  timesPerDay: 1,
  timeSlots: { morning: true, afternoon: false, evening: false },
  times: ["08:00"],
  shape: "round",
  color: "#4CAF50",
  instructions: "",
  imprint: "",
  startDate: new Date().toISOString().split("T")[0],
  durationDays: 7,
};

export default function AddMedication() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const { medications, refresh } = useMedications();
  const [step, setStep] = useState<Step>("select");
  const [form, setForm] = useState<MedicationForm>(initialForm);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingInteractions, setIsCheckingInteractions] = useState(false);
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [scanResult, setScanResult] = useState<PillIdentificationResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOptionSelect = (option: string) => {
    if (option === "camera") {
      setStep("scan");
    } else if (option === "manual") {
      setStep("details");
    } else if (option === "barcode") {
      setStep("barcode");
    } else if (option === "ocr") {
      setStep("ocr");
    } else {
      toast.info("This feature is coming soon!");
    }
  };

  const handleBarcodeScan = (data: string) => {
    console.log("Barcode scanned:", data);
    // Try to extract medication info from barcode
    // NDC codes are typically 10-11 digits
    if (/^\d{10,11}$/.test(data)) {
      toast.success("NDC code scanned!");
      setForm((prev) => ({
        ...prev,
        name: `NDC: ${data}`,
      }));
    } else if (data.startsWith("http")) {
      // URL scanned - could be manufacturer info
      toast.info("URL scanned. Please enter medication details manually.");
    } else {
      // Generic barcode - use as name placeholder
      toast.success("Code scanned successfully!");
      setForm((prev) => ({
        ...prev,
        name: data.substring(0, 100), // Limit length
      }));
    }
    setStep("details");
  };

  const handleOCRScanComplete = (result: {
    identified: boolean;
    confidence: number;
    medication: {
      name: string | null;
      genericName: string | null;
      strength: string | null;
      manufacturer: string | null;
    };
    characteristics: {
      shape: string;
      primaryColor: string;
      secondaryColor: string | null;
      imprint: string | null;
      size: string;
      features: string[];
    };
    warnings: string[];
    requiresManualVerification: boolean;
  }) => {
    setScanResult(result as PillIdentificationResult);
    setScanConfidence(result.confidence);

    if (result.identified && result.medication.name) {
      setForm((prev) => ({
        ...prev,
        name: result.medication.name || "",
        genericName: result.medication.genericName || "",
        strength: result.medication.strength || "",
        shape: result.characteristics.shape || "round",
        color: result.characteristics.primaryColor || "#4CAF50",
        imprint: result.characteristics.imprint || "",
      }));

      if (result.confidence >= 85) {
        toast.success(`Identified: ${result.medication.name}!`);
      } else {
        toast.warning("Low confidence. Please verify the details.");
      }
    } else {
      toast.warning("Could not identify medication. Please enter details manually.");
    }

    setStep("details");
  };

  const handleCapture = async (imageData: string) => {
    setIsProcessing(true);
    
    try {
      const { data, error } = await apiClient.functions.invoke("pill-identify", {
        body: { imageBase64: imageData },
      });

      if (error) {
        console.error("Pill identification error:", error);
        toast.error("Failed to analyze pill. Please try again or use manual entry.");
        setIsProcessing(false);
        return;
      }

      if (!data.success) {
        toast.error(data.error || "Failed to identify pill");
        setIsProcessing(false);
        return;
      }

      const result: PillIdentificationResult = data.data;
      setScanResult(result);
      setScanConfidence(result.confidence);

      // Populate form with identified data
      if (result.identified && result.medication.name) {
        setForm((prev) => ({
          ...prev,
          name: result.medication.name || "",
          genericName: result.medication.genericName || "",
          strength: result.medication.strength || "",
          shape: result.characteristics.shape || "round",
          color: result.characteristics.primaryColor || "#4CAF50",
          imprint: result.characteristics.imprint || "",
        }));

        if (result.confidence >= 85) {
          toast.success(`Pill identified with ${result.confidence}% confidence!`);
        } else {
          toast.warning(`Low confidence (${result.confidence}%). Please verify details.`);
        }
      } else {
        toast.warning("Could not identify pill. Please enter details manually.");
      }

      setStep("details");
    } catch (err) {
      console.error("Error during pill identification:", err);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const validateForm = (): boolean => {
    const result = medicationSchema.safeParse({
      name: form.name,
      genericName: form.genericName || undefined,
      strength: form.strength || undefined,
      dosage: form.dosage || undefined,
      form: form.form || undefined,
      shape: form.shape || undefined,
      color: form.color || undefined,
      instructions: form.instructions || undefined,
    });

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const getScheduleFromFrequency = (frequency: string, times: string[], timesPerDay: number) => {
    const scheduleMap: Record<string, string> = {
      once: "daily",
      twice: "daily",
      three: "daily",
      weekly: "weekly",
      prn: "prn",
    };

    return {
      type: scheduleMap[frequency] || "daily",
      times: times,
      frequency: frequency,
      timesPerDay: timesPerDay,
    };
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error("Please fix the errors before continuing");
      return;
    }

    if (!user) {
      toast.error("Please sign in to add medications");
      return;
    }

    setIsSaving(true);

    try {
      const schedule = getScheduleFromFrequency(form.frequency, form.times, form.timesPerDay);
      
      // Calculate end date based on duration
      const startDate = new Date(form.startDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + form.durationDays);

      const medicationPayload = {
        user_id: user.id,
        name: form.name.trim(),
        generic_name: form.genericName.trim() || null,
        strength: form.strength.trim() || null,
        dosage: form.dosage.trim() || null,
        form: form.form || "tablet",
        shape: form.shape || null,
        color: form.color || null,
        imprint: form.imprint.trim() || null,
        instructions: form.instructions.trim() || null,
        schedule: schedule,
        confidence_score: scanConfidence,
        is_active: true,
        start_date: form.startDate,
        end_date: endDate.toISOString().split("T")[0],
      };

      if (!isOnline) {
        const offlineMedication = {
          id: crypto.randomUUID(),
          ...medicationPayload,
          brand_name: null,
          refill_reminder: true,
          pills_remaining: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const key = cacheKey(user.id, "medications");
        const cached = readCachedData<any[]>(key);
        writeCachedData(key, [offlineMedication, ...(cached?.data || medications)]);
        enqueueSyncAction("ADD_MEDICATION", medicationPayload);
        toast.info("Medication saved offline. It will sync when you're back online.");
        navigate("/medications");
        return;
      }

      const { data: insertedMed, error } = await apiClient.from("medications").insert(medicationPayload).select().single();

      if (error) {
        console.error("Error saving medication:", error);
        if (error.code === "23505") {
          toast.error("This medication already exists");
        } else if (error.code === "42501") {
          toast.error("Permission denied. Please sign in again.");
        } else {
          toast.error("Failed to save medication. Please try again.");
        }
        return;
      }

      // Check for drug interactions with existing medications
      if (medications.length > 0 && insertedMed) {
        setIsCheckingInteractions(true);
        toast.info("Checking for drug interactions...");
        
        try {
          const result = await checkDrugInteractions([
            ...medications.map((medication) => ({
              id: medication.id,
              name: medication.name,
              genericName: medication.generic_name,
              strength: medication.strength,
              dosage: medication.dosage,
              isActive: medication.is_active,
            })),
            {
              id: insertedMed.id,
              name: insertedMed.name,
              genericName: insertedMed.generic_name,
              strength: insertedMed.strength,
              dosage: insertedMed.dosage,
              isActive: insertedMed.is_active,
            },
          ]);

          if (result.interactions.length > 0) {
            const highRiskCount = result.interactions.filter(
              (interaction) => interaction.severity === "high"
            ).length;
            if (highRiskCount > 0) {
              toast.warning(
                `${highRiskCount} severe interaction${highRiskCount > 1 ? "s" : ""} detected. Please review your medications.`
              );
            } else {
              toast.info(
                `${result.interactions.length} potential interaction${result.interactions.length > 1 ? "s" : ""} found. Please review your medications.`
              );
            }
          } else if (result.error) {
            toast.message(result.error);
          }
        } catch (interactionError) {
          console.error("Error checking interactions:", interactionError);
          // Don't block the flow if interaction check fails
        } finally {
          setIsCheckingInteractions(false);
        }
      }

      // Refresh medications list
      await refresh();

      toast.success("Medication added successfully!");
      navigate("/medications");
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateForm = (field: keyof MedicationForm, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const canProceedToSchedule = form.name.trim().length > 0;

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (step === "select") {
                  navigate(-1);
                } else if (step === "scan") {
                  setStep("select");
                } else if (step === "details") {
                  setStep(scanConfidence ? "scan" : "select");
                } else if (step === "schedule") {
                  setStep("details");
                } else {
                  setStep("schedule");
                }
              }}
              disabled={isSaving}
            >
              <Icons.chevronRight className="w-5 h-5 rotate-180" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Add Medication</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        <AnimatePresence mode="wait">
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <AddMedicationOptions onSelect={handleOptionSelect} />
            </motion.div>
          )}

          {step === "scan" && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CameraScanView
                onCapture={handleCapture}
                onClose={() => setStep("select")}
                isProcessing={isProcessing}
              />
            </motion.div>
          )}

          {step === "barcode" && (
            <QRScanner
              onScan={handleBarcodeScan}
              onClose={() => setStep("select")}
            />
          )}

          {step === "ocr" && (
            <MedicationScanner
              onScanComplete={handleOCRScanComplete}
              onClose={() => setStep("select")}
            />
          )}

          {step === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {scanResult && scanResult.identified && (
                <Card variant={scanConfidence && scanConfidence >= 85 ? "success" : "warning"} className="mb-4">
                  <CardContent className="p-4 flex items-center gap-3">
                    {scanConfidence && scanConfidence >= 85 ? (
                      <Icons.checkCircle className="w-5 h-5 text-success" />
                    ) : (
                      <Icons.alertTriangle className="w-5 h-5 text-warning" />
                    )}
                    <div>
                      <p className="font-semibold text-foreground">
                        AI Identification {scanConfidence && scanConfidence >= 85 ? "Successful" : "- Low Confidence"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Confidence: {scanConfidence}% - {scanConfidence && scanConfidence >= 85 
                          ? "Please verify details" 
                          : "Manual verification required"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {scanResult && scanResult.warnings && scanResult.warnings.length > 0 && (
                <Card variant="warning" className="mb-4">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Icons.alertTriangle className="w-5 h-5 text-warning mt-0.5" />
                      <div>
                        <p className="font-semibold text-foreground">Warnings</p>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          {scanResult.warnings.map((warning, index) => (
                            <li key={index}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Medication Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Medication Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => updateForm("name", e.target.value)}
                      placeholder="e.g., Metformin"
                      className={errors.name ? "border-destructive" : ""}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="genericName">Generic Name (optional)</Label>
                    <Input
                      id="genericName"
                      value={form.genericName}
                      onChange={(e) => updateForm("genericName", e.target.value)}
                      placeholder="e.g., Metformin HCl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="strength">Strength</Label>
                      <Input
                        id="strength"
                        value={form.strength}
                        onChange={(e) => updateForm("strength", e.target.value)}
                        placeholder="e.g., 500mg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dosage">Dosage</Label>
                      <Input
                        id="dosage"
                        value={form.dosage}
                        onChange={(e) => updateForm("dosage", e.target.value)}
                        placeholder="e.g., 1 tablet"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Form</Label>
                      <Select value={form.form} onValueChange={(v) => updateForm("form", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tablet">Tablet</SelectItem>
                          <SelectItem value="capsule">Capsule</SelectItem>
                          <SelectItem value="liquid">Liquid</SelectItem>
                          <SelectItem value="injection">Injection</SelectItem>
                          <SelectItem value="patch">Patch</SelectItem>
                          <SelectItem value="inhaler">Inhaler</SelectItem>
                          <SelectItem value="drops">Drops</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pill Shape</Label>
                      <Select value={form.shape} onValueChange={(v) => updateForm("shape", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="round">Round</SelectItem>
                          <SelectItem value="oval">Oval</SelectItem>
                          <SelectItem value="capsule">Capsule</SelectItem>
                          <SelectItem value="tablet">Tablet</SelectItem>
                          <SelectItem value="oblong">Oblong</SelectItem>
                          <SelectItem value="diamond">Diamond</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {form.imprint && (
                    <div className="space-y-2">
                      <Label htmlFor="imprint">Pill Imprint</Label>
                      <Input
                        id="imprint"
                        value={form.imprint}
                        onChange={(e) => updateForm("imprint", e.target.value)}
                        placeholder="e.g., M 500"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="instructions">Special Instructions (optional)</Label>
                    <Textarea
                      id="instructions"
                      value={form.instructions}
                      onChange={(e) => updateForm("instructions", e.target.value)}
                      placeholder="e.g., Take with food, avoid grapefruit..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full" 
                onClick={() => setStep("schedule")}
                disabled={!canProceedToSchedule}
              >
                Continue to Schedule
                <Icons.chevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {step === "schedule" && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle>When do you start?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => updateForm("startDate", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>How many days will you take this medicine?</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[7, 14, 30, 90].map((days) => (
                        <Button
                          key={days}
                          type="button"
                          variant={form.durationDays === days ? "default" : "outline"}
                          size="sm"
                          onClick={() => setForm(prev => ({ ...prev, durationDays: days }))}
                        >
                          {days} days
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={form.durationDays}
                        onChange={(e) => setForm(prev => ({ ...prev, durationDays: parseInt(e.target.value) || 7 }))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How many times per day?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((times) => (
                      <Button
                        key={times}
                        type="button"
                        variant={form.timesPerDay === times ? "default" : "outline"}
                        className="flex flex-col py-4 h-auto"
                        onClick={() => {
                          const newSlots = { morning: false, afternoon: false, evening: false };
                          if (times >= 1) newSlots.morning = true;
                          if (times >= 2) newSlots.evening = true;
                          if (times >= 3) newSlots.afternoon = true;
                          const frequencyMap: Record<number, string> = { 1: "once", 2: "twice", 3: "three" };
                          setForm(prev => ({
                            ...prev,
                            timesPerDay: times,
                            frequency: frequencyMap[times] || "once",
                            timeSlots: newSlots,
                            times: getTimesFromSlots(newSlots),
                          }));
                        }}
                      >
                        <span className="text-2xl font-bold">{times}</span>
                        <span className="text-xs text-muted-foreground">
                          {times === 1 ? "time" : "times"}/day
                        </span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>When should you take it?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "morning" as const, label: "Morning", time: "08:00", icon: "🌅" },
                      { key: "afternoon" as const, label: "Afternoon", time: "14:00", icon: "☀️" },
                      { key: "evening" as const, label: "Evening", time: "20:00", icon: "🌙" },
                    ].map(({ key, label, time, icon }) => {
                      const selectedCount = Object.values(form.timeSlots).filter(Boolean).length;
                      const isSelected = form.timeSlots[key];
                      const canDeselect = selectedCount > 1;
                      
                      return (
                        <Button
                          key={key}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          className="flex flex-col py-4 h-auto"
                          onClick={() => {
                            if (isSelected && !canDeselect) return;
                            const newSlots = { ...form.timeSlots, [key]: !isSelected };
                            const newTimes = getTimesFromSlots(newSlots);
                            setForm(prev => ({
                              ...prev,
                              timeSlots: newSlots,
                              times: newTimes,
                              timesPerDay: newTimes.length,
                            }));
                          }}
                        >
                          <span className="text-2xl">{icon}</span>
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-xs text-muted-foreground">{time}</span>
                        </Button>
                      );
                    })}
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm text-muted-foreground">Custom reminder times</Label>
                    <div className="space-y-2">
                      {form.times.map((time, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={time}
                            onChange={(e) => {
                              const newTimes = [...form.times];
                              newTimes[index] = e.target.value;
                              updateForm("times", newTimes);
                            }}
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground">
                            {index === 0 && form.timeSlots.morning && "Morning"}
                            {index === 1 && form.timeSlots.afternoon && "Afternoon"}
                            {index === 1 && !form.timeSlots.afternoon && form.timeSlots.evening && "Evening"}
                            {index === 2 && "Evening"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <Icons.bell className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Reminder Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      You'll receive notifications at {form.times.join(", ")} to take your {form.name || "medication"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card variant="warning">
                <CardContent className="p-4 flex items-start gap-3">
                  <Icons.alertTriangle className="w-5 h-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Safety Check</p>
                    <p className="text-sm text-muted-foreground">
                      Maximum daily dose for {form.name || "this medication"}: Check with your doctor
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === "schedule" && (
            <motion.div
              key="schedule-summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 mt-6"
            >

              {/* Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Medication</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                  {form.strength && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Strength</span>
                      <span className="font-medium">{form.strength}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dosage</span>
                    <span className="font-medium">{form.dosage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Date</span>
                    <span className="font-medium">{new Date(form.startDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{form.durationDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frequency</span>
                    <span className="font-medium">{form.timesPerDay}x daily</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Times</span>
                    <span className="font-medium">{form.times.join(", ")}</span>
                  </div>
                  {scanConfidence && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AI Confidence</span>
                      <span className={`font-medium ${scanConfidence >= 85 ? "text-success" : "text-warning"}`}>
                        {scanConfidence}%
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button 
                className="w-full" 
                onClick={handleSubmit}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full mr-2"
                    />
                    Saving...
                  </>
                ) : (
                  <>
                    <Icons.checkCircle className="w-4 h-4" />
                    Add Medication
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}
