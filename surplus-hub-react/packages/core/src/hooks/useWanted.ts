import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
import { closeWanted, createWanted, fetchMyWanted, fetchWanted, fetchWantedList } from "../api";
import { Wanted, WantedCreateInput, WantedListParams, WantedListResponse } from "../types";

// 키는 전부 "wanted" 접두사 — 생성·마감 후 한 번에 무효화한다.
// ponytail: 첫 페이지만 쓴다(최대 50건). 요청이 쌓이면 cursor로 useInfiniteQuery 전환
export const useWantedList = (params: WantedListParams = {}): UseQueryResult<WantedListResponse> => {
  return useQuery<WantedListResponse>({
    queryKey: ["wanted", "list", params],
    queryFn: () => fetchWantedList(params),
  });
};

/** 로그인 화면 뒤에서만 쓴다. hasAuthToken()은 네이티브에서 항상 false라 게이트로 쓰지 않는다 */
export const useMyWanted = (): UseQueryResult<Wanted[]> => {
  return useQuery<Wanted[]>({
    queryKey: ["wanted", "me"],
    queryFn: fetchMyWanted,
  });
};

export const useWanted = (id: string): UseQueryResult<Wanted> => {
  return useQuery<Wanted>({
    queryKey: ["wanted", "detail", id],
    queryFn: () => fetchWanted(id),
    enabled: !!id,
    retry: false,
  });
};

export const useCreateWanted = (): UseMutationResult<Wanted, Error, WantedCreateInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WantedCreateInput) => createWanted(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wanted"] });
    },
  });
};

export const useCloseWanted = (): UseMutationResult<Wanted, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => closeWanted(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wanted"] });
    },
  });
};
