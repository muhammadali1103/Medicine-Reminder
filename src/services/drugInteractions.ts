export interface DrugInteractionMedication {
  id: string;
  name: string;
  genericName?: string | null;
  strength?: string | null;
  dosage?: string | null;
  isActive?: boolean;
}

export interface DrugInteractionResult {
  id: string;
  medicationIds: string[];
  medicationNames: string[];
  severity: "low" | "medium" | "high";
  severityLabel: "Mild" | "Moderate" | "Severe";
  description: string;
  source: string;
}

export interface DrugInteractionCheckResult {
  interactions: DrugInteractionResult[];
  error: string | null;
}

interface RxNormLookupResponse {
  idGroup?: {
    rxnormId?: string[];
  };
}

interface RxNormInteractionResponse {
  fullInteractionTypeGroup?: Array<{
    sourceName?: string;
    fullInteractionType?: Array<{
      interactionPair?: Array<{
        severity?: string;
        description?: string;
        interactionConcept?: Array<{
          minConceptItem?: {
            rxcui?: string;
            name?: string;
          };
        }>;
      }>;
    }>;
  }>;
}

interface ResolvedMedication extends DrugInteractionMedication {
  rxCui: string;
  searchName: string;
}

const RXCUI_URL = "https://rxnav.nlm.nih.gov/REST/rxcui.json";
const INTERACTION_URL = "https://rxnav.nlm.nih.gov/REST/interaction/list.json";

const rxCuiCache = new Map<string, string | null>();

function normalizeSearchName(medication: DrugInteractionMedication): string {
  return (medication.genericName || medication.name || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSeverity(severity: string | undefined, description: string | undefined) {
  const combined = `${severity || ""} ${description || ""}`.toLowerCase();

  if (
    combined.includes("severe") ||
    combined.includes("major") ||
    combined.includes("contraindicated") ||
    combined.includes("significant")
  ) {
    return { severity: "high" as const, severityLabel: "Severe" as const };
  }

  if (combined.includes("moderate") || combined.includes("monitor")) {
    return { severity: "medium" as const, severityLabel: "Moderate" as const };
  }

  return { severity: "low" as const, severityLabel: "Mild" as const };
}

async function fetchRxCui(searchName: string): Promise<string | null> {
  if (!searchName) {
    return null;
  }

  const cacheKey = searchName.toLowerCase();
  if (rxCuiCache.has(cacheKey)) {
    return rxCuiCache.get(cacheKey) ?? null;
  }

  const url = `${RXCUI_URL}?name=${encodeURIComponent(searchName)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`RxNorm lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as RxNormLookupResponse;
  const rxCui = data.idGroup?.rxnormId?.[0] ?? null;
  rxCuiCache.set(cacheKey, rxCui);
  return rxCui;
}

function buildInteractionId(medicationIds: string[], description: string) {
  return `${medicationIds.slice().sort().join(":")}:${description.toLowerCase()}`;
}

function parseInteractionResponse(
  response: RxNormInteractionResponse,
  pair: [ResolvedMedication, ResolvedMedication]
) {
  const parsed: DrugInteractionResult[] = [];
  const groups = response.fullInteractionTypeGroup ?? [];

  for (const group of groups) {
    for (const interactionType of group.fullInteractionType ?? []) {
      for (const interactionPair of interactionType.interactionPair ?? []) {
        const description =
          interactionPair.description?.trim() ||
          `${pair[0].name} may interact with ${pair[1].name}.`;

        const conceptMap = new Map(
          (interactionPair.interactionConcept ?? [])
            .map((concept) => {
              const rxcui = concept.minConceptItem?.rxcui;
              return rxcui ? [rxcui, concept.minConceptItem?.name || ""] : null;
            })
            .filter((entry): entry is [string, string] => !!entry)
        );

        const matchedMeds = pair.filter((med) => conceptMap.size === 0 || conceptMap.has(med.rxCui));
        if (matchedMeds.length < 2) {
          continue;
        }

        const { severity, severityLabel } = normalizeSeverity(
          interactionPair.severity,
          interactionPair.description
        );

        parsed.push({
          id: buildInteractionId(
            matchedMeds.map((med) => med.id),
            description
          ),
          medicationIds: matchedMeds.map((med) => med.id),
          medicationNames: matchedMeds.map((med) => med.name),
          severity,
          severityLabel,
          description,
          source: group.sourceName || "RxNorm",
        });
      }
    }
  }

  return parsed;
}

async function fetchPairInteractions(pair: [ResolvedMedication, ResolvedMedication]) {
  const response = await fetch(
    `${INTERACTION_URL}?rxcuis=${encodeURIComponent(`${pair[0].rxCui}+${pair[1].rxCui}`)}`
  );

  if (!response.ok) {
    throw new Error(`Interaction lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as RxNormInteractionResponse;
  return parseInteractionResponse(data, pair);
}

export async function checkDrugInteractions(
  medications: DrugInteractionMedication[]
): Promise<DrugInteractionCheckResult> {
  const activeMedications = medications.filter(
    (medication) => medication.isActive !== false && normalizeSearchName(medication)
  );

  if (activeMedications.length < 2) {
    return { interactions: [], error: null };
  }

  try {
    const resolved = await Promise.all(
      activeMedications.map(async (medication) => {
        const searchName = normalizeSearchName(medication);
        const rxCui = await fetchRxCui(searchName);

        if (!rxCui) {
          return null;
        }

        return {
          ...medication,
          rxCui,
          searchName,
        } satisfies ResolvedMedication;
      })
    );

    const usableMeds = resolved.filter((medication): medication is ResolvedMedication => !!medication);
    if (usableMeds.length < 2) {
      return { interactions: [], error: null };
    }

    const pairRequests: Array<Promise<DrugInteractionResult[]>> = [];
    for (let index = 0; index < usableMeds.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < usableMeds.length; innerIndex += 1) {
        pairRequests.push(fetchPairInteractions([usableMeds[index], usableMeds[innerIndex]]));
      }
    }

    const pairResults = await Promise.all(pairRequests);
    const uniqueInteractions = new Map<string, DrugInteractionResult>();

    for (const interactions of pairResults) {
      for (const interaction of interactions) {
        uniqueInteractions.set(interaction.id, interaction);
      }
    }

    const interactions = Array.from(uniqueInteractions.values()).sort((left, right) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[left.severity] - rank[right.severity];
    });

    return { interactions, error: null };
  } catch (error) {
    console.error("Drug interaction check failed:", error);
    return {
      interactions: [],
      error: "The interaction checker is temporarily unavailable. Please try again in a moment.",
    };
  }
}
