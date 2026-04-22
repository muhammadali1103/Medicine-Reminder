import { useEffect, useMemo, useState } from "react";
import {
  checkDrugInteractions,
  type DrugInteractionMedication,
  type DrugInteractionResult,
} from "@/services/drugInteractions";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface UseDrugInteractionsResult {
  interactions: DrugInteractionResult[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  hasSevereInteraction: boolean;
}

export function useDrugInteractions(medications: DrugInteractionMedication[]): UseDrugInteractionsResult {
  const { isOnline } = useOnlineStatus();
  const [interactions, setInteractions] = useState<DrugInteractionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.isActive !== false),
    [medications]
  );

  const medicationSignature = useMemo(
    () =>
      activeMedications
        .map((medication) => `${medication.id}:${medication.genericName || medication.name}:${medication.strength || ""}`)
        .sort()
        .join("|"),
    [activeMedications]
  );

  useEffect(() => {
    let cancelled = false;

    if (activeMedications.length < 2) {
      setInteractions([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!isOnline) {
      setInteractions([]);
      setError("Drug interaction check requires internet connection.");
      setLoading(false);
      return;
    }

    setLoading(true);

    void checkDrugInteractions(activeMedications).then((result) => {
      if (cancelled) {
        return;
      }

      setInteractions(result.interactions);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeMedications, isOnline, medicationSignature]);

  return {
    interactions,
    loading,
    error,
    totalCount: interactions.length,
    hasSevereInteraction: interactions.some((interaction) => interaction.severity === "high"),
  };
}
