import { useMutation, useQuery, useQueryClient, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import {
  createMaterial,
  fetchMaterials,
  fetchMaterialById,
  fetchMyWishlist,
  toggleMaterialLike,
  checkMaterialLike,
  updateMaterial,
  deleteMaterial,
} from "../api";
import { hasAuthToken } from "../api/client";
import {
  MaterialCreateInput,
  MaterialUpdateInput,
  MaterialItem,
  MaterialLikeStatus,
  MaterialQueryParams,
  MaterialResponse,
} from "../types";

export const useMaterials = (params?: MaterialQueryParams): UseQueryResult<MaterialResponse> => {
  return useQuery<MaterialResponse>({
    queryKey: ["materials", params ?? {}],
    queryFn: () => fetchMaterials(params),
  });
};

export const useMaterialDetail = (id: string): UseQueryResult<MaterialItem | undefined> => {
  return useQuery<MaterialItem | undefined>({
    queryKey: ["material", id],
    queryFn: () => fetchMaterialById(id),
    enabled: !!id,
  });
};

export const useCreateMaterial = (): UseMutationResult<MaterialItem, Error, MaterialCreateInput> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MaterialCreateInput) => createMaterial(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
};

export const useMyWishlist = (params?: { page?: number; limit?: number }): UseQueryResult<MaterialResponse> => {
  return useQuery<MaterialResponse>({
    queryKey: ["myWishlist", params ?? {}],
    queryFn: () => fetchMyWishlist(params),
  });
};

export const useMaterialLikeStatus = (id: string): UseQueryResult<MaterialLikeStatus> => {
  return useQuery<MaterialLikeStatus>({
    queryKey: ["materialLike", id],
    queryFn: () => checkMaterialLike(id),
    enabled: !!id && hasAuthToken(),
    retry: false,
    // 다른 사용자의 관심 수를 열린 화면에도 반영 (탭이 보일 때만 폴링; 포커스 복귀 시 재조회는 기본값)
    // ponytail: 30초 폴링, 실시간이 필요하면 WS 이벤트로 교체
    refetchInterval: 30_000,
  });
};

export const useToggleMaterialLike = (id: string): UseMutationResult<MaterialLikeStatus, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => toggleMaterialLike(id),
    onSuccess: (data) => {
      queryClient.setQueryData<MaterialLikeStatus>(["materialLike", id], data);
      queryClient.invalidateQueries({ queryKey: ["material", id] });
      queryClient.invalidateQueries({ queryKey: ["myWishlist"] });
    },
  });
};

export const useUpdateMaterial = (id: string): UseMutationResult<MaterialItem, Error, MaterialUpdateInput> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MaterialUpdateInput) => updateMaterial(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material", id] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
};

export const useDeleteMaterial = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMaterial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["myWishlist"] });
    },
  });
};
