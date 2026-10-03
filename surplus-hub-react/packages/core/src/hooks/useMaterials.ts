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
