import { useMutation, UseMutationResult } from "@tanstack/react-query";
import { uploadImage } from "../api/upload";

export const useUploadImage = (): UseMutationResult<string, Error, File> => {
    return useMutation({
        mutationFn: (file: File) => uploadImage(file),
    });
};
