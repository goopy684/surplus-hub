import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { aiSearch, fetchCategories, getSearchSuggestions } from "../api";
import { AiSearchParams, AiSearchResponse, AiSearchSuggestions, Category } from "../types";

export const useAiSearch = (params: AiSearchParams, enabled = true): UseQueryResult<AiSearchResponse> => {
  return useQuery<AiSearchResponse>({
    queryKey: ["aiSearch", params],
    queryFn: () => aiSearch(params),
    enabled: enabled && params.q.trim().length > 0,
    // 실패 시 화면이 키워드 검색으로 빨리 넘어가도록 재시도 1회만
    retry: 1,
  });
};

export const useSearchSuggestions = (keyword: string): UseQueryResult<AiSearchSuggestions> => {
  return useQuery<AiSearchSuggestions>({
    queryKey: ["searchSuggestions", keyword],
    queryFn: () => getSearchSuggestions(keyword),
    enabled: keyword.trim().length >= 2,
    staleTime: 30_000,
  });
};

export const useCategories = (): UseQueryResult<Category[]> => {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
};
