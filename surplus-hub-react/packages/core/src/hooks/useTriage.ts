import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  convertTriage,
  createTriage,
  fetchHotDemands,
  fetchSharedTriage,
  fetchTriage,
  fetchTriageVault,
  saveTriageToVault,
} from "../api";
import {
  HotDemandParams,
  HotDemands,
  TriageConvertInput,
  TriageConvertResult,
  TriageDiagnosis,
  TriageInput,
} from "../types";

export const useCreateTriage = (): UseMutationResult<TriageDiagnosis, Error, TriageInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TriageInput) => createTriage(input),
    onSuccess: (diagnosis) => {
      if (diagnosis.id) queryClient.setQueryData(["triage", diagnosis.id], diagnosis);
    },
  });
};

export const useTriage = (id: string): UseQueryResult<TriageDiagnosis> => {
  return useQuery<TriageDiagnosis>({
    queryKey: ["triage", id],
    queryFn: () => fetchTriage(id),
    // 화면이 로그인 게이트 뒤에 있다. hasAuthToken()은 localStorage 기반이라 네이티브에서 항상 false다.
    enabled: !!id,
  });
};

export const useTriageVault = (includeListed = false): UseQueryResult<TriageDiagnosis[]> => {
  return useQuery<TriageDiagnosis[]>({
    queryKey: ["triageVault", includeListed],
    queryFn: () => fetchTriageVault(includeListed),
  });
};

export const useSaveTriageToVault = (): UseMutationResult<TriageDiagnosis, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => saveTriageToVault(id),
    onSuccess: (diagnosis, id) => {
      queryClient.setQueryData(["triage", id], diagnosis);
      queryClient.invalidateQueries({ queryKey: ["triageVault"] });
    },
  });
};

export const useConvertTriage = (): UseMutationResult<
  TriageConvertResult,
  Error,
  { id: string; input?: TriageConvertInput }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: TriageConvertInput }) => convertTriage(id, input),
    onSuccess: (result, { id }) => {
      queryClient.setQueryData(["triage", id], result.diagnosis);
      queryClient.invalidateQueries({ queryKey: ["triageVault"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
};

export const useSharedTriage = (token: string): UseQueryResult<TriageDiagnosis> => {
  return useQuery<TriageDiagnosis>({
    queryKey: ["triageShared", token],
    queryFn: () => fetchSharedTriage(token),
    enabled: !!token,
    retry: false,
  });
};

/** 홈 전광판. 서버가 5분 캐시하므로 클라이언트도 같은 주기로 본다 */
export const useHotDemands = (params: HotDemandParams = {}): UseQueryResult<HotDemands> => {
  return useQuery<HotDemands>({
    queryKey: ["triageHotDemands", params],
    queryFn: () => fetchHotDemands(params),
    staleTime: 5 * 60_000,
    retry: false,
  });
};
