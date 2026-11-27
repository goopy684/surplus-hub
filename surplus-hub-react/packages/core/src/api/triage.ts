import { apiClient, unwrapApiData } from "./client";
import {
  HotDemandParams,
  HotDemands,
  TriageConvertInput,
  TriageConvertResult,
  TriageDiagnosis,
  TriageInput,
  TriagePath,
  TriageStatus,
} from "../types";
import { normalizeIso, parseOptionalNumber, readNumber, readRecord, readString } from "./utils";

const BASE = "/api/v1/ai/triage";

const readPath = (value: unknown): TriagePath => (value === "A" || value === "B" ? value : "C");

const readStatus = (value: unknown): TriageStatus =>
  value === "VAULT_SAVED" || value === "LISTED_MATERIAL" ? value : "DIAGNOSED";

export const mapTriageDiagnosis = (raw: unknown): TriageDiagnosis => {
  const item = readRecord(raw);
  const comparison = readRecord(item.comparison);
  const breakdown = readRecord(item.breakdown);
  const location = readRecord(item.location);
  const id = item.id === undefined || item.id === null ? undefined : String(item.id);
  const materialId =
    item.materialId === undefined || item.materialId === null ? undefined : String(item.materialId);

  return {
    id,
    status: readStatus(item.status),
    title: readString(item.title) || "진단 자재",
    category: readString(item.category),
    materialKey: readString(item.materialKey),
    materialLabel: readString(item.materialLabel),
    conditionGrade: readString(item.conditionGrade),
    specText: readString(item.specText),
    imageUrls: Array.isArray(item.imageUrls)
      ? item.imageUrls.filter((url): url is string => typeof url === "string")
      : [],
    quantity: parseOptionalNumber(item.quantity),
    quantityUnit: readString(item.quantityUnit),
    weightKg: parseOptionalNumber(item.weightKg),
    weightEstimated: item.weightEstimated === true,
    locationAddress: readString(location.address),
    liquidityScore: readNumber(item.liquidityScore),
    initialScore: readNumber(item.initialScore, readNumber(item.liquidityScore)),
    scoreDelta: readNumber(item.scoreDelta),
    matchProbability7d: readNumber(item.matchProbability7d),
    expectedDays: readNumber(item.expectedDays),
    breakdown: {
      condition: readNumber(breakdown.condition),
      spec: readNumber(breakdown.spec),
      demand: readNumber(breakdown.demand),
      materialValue: readNumber(breakdown.materialValue),
      reuseScore: readNumber(breakdown.reuseScore),
      materialBonus: readNumber(breakdown.materialBonus),
      searchCount: readNumber(breakdown.searchCount),
      similarActiveCount: readNumber(breakdown.similarActiveCount),
      similarSoldCount: readNumber(breakdown.similarSoldCount),
      wantedCount: readNumber(breakdown.wantedCount),
    },
    coldStart: item.coldStart === true,
    analysisMode: readString(item.analysisMode) || "rule_based",
    dispositionPath: readPath(item.dispositionPath),
    pathLabel: readString(item.pathLabel) || "",
    pathReason: readString(item.pathReason) || "",
    comparison: {
      mixedWaste: readNumber(comparison.mixedWaste),
      scrap: readNumber(comparison.scrap),
      directSale: readNumber(comparison.directSale),
      netBenefit: readNumber(comparison.netBenefit),
      priceBasis: readString(comparison.priceBasis) || "category_default",
      similarPriceCount: readNumber(comparison.similarPriceCount),
    },
    shareToken: readString(item.shareToken) || "",
    shareUrl: readString(item.shareUrl),
    materialId,
    createdAt: normalizeIso(item.createdAt),
  };
};

export const createTriage = async (input: TriageInput): Promise<TriageDiagnosis> => {
  const response = await apiClient.post(BASE, input);
  return mapTriageDiagnosis(unwrapApiData<unknown>(response.data));
};

export const fetchTriage = async (id: string): Promise<TriageDiagnosis> => {
  const response = await apiClient.get(`${BASE}/${id}`);
  return mapTriageDiagnosis(unwrapApiData<unknown>(response.data));
};

export const fetchTriageVault = async (includeListed = false): Promise<TriageDiagnosis[]> => {
  const response = await apiClient.get(`${BASE}/vault`, { params: { includeListed } });
  const raw = unwrapApiData<unknown>(response.data);
  return Array.isArray(raw) ? raw.map(mapTriageDiagnosis) : [];
};

export const saveTriageToVault = async (id: string): Promise<TriageDiagnosis> => {
  const response = await apiClient.post(`${BASE}/${id}/save-vault`);
  return mapTriageDiagnosis(unwrapApiData<unknown>(response.data));
};

export const convertTriage = async (
  id: string,
  input: TriageConvertInput = {}
): Promise<TriageConvertResult> => {
  const response = await apiClient.post(`${BASE}/${id}/convert`, input);
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    diagnosis: mapTriageDiagnosis(raw.diagnosis),
    materialId: String(raw.materialId ?? ""),
  };
};

export const fetchSharedTriage = async (token: string): Promise<TriageDiagnosis> => {
  const response = await apiClient.get(`${BASE}/shared/${encodeURIComponent(token)}`);
  return mapTriageDiagnosis(unwrapApiData<unknown>(response.data));
};

export const fetchHotDemands = async (params: HotDemandParams = {}): Promise<HotDemands> => {
  const response = await apiClient.get(`${BASE}/hot-demands`, { params });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    scope: raw.scope === "nearby" ? "nearby" : "all",
    radiusKm: readNumber(raw.radiusKm, 10),
    items: Array.isArray(raw.items)
      ? raw.items.map((entry) => {
          const item = readRecord(entry);
          return {
            key: readString(item.key) || "",
            label: readString(item.label) || "",
            searchCount: readNumber(item.searchCount),
            wantedCount: readNumber(item.wantedCount),
            liquidityScore: readNumber(item.liquidityScore),
          };
        })
      : [],
    weeklyDisposalSaved: readNumber(raw.weeklyDisposalSaved),
    weeklyListedCount: readNumber(raw.weeklyListedCount),
  };
};
