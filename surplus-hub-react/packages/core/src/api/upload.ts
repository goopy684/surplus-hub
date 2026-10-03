
import { apiClient, unwrapApiData } from "./client";

export interface UploadResponse {
    url: string;
}

export const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post("/api/v1/upload/image", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });

    const data = unwrapApiData<UploadResponse>(response.data);
    return data.url;
};

// Backend (/api/v1/upload/image) rejects anything outside this set.
const MIME_BY_EXTENSION: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
};

/**
 * React Native variant of uploadImage: RN has no web `File`, its FormData takes
 * a `{ uri, name, type }` part instead. Same endpoint, same response.
 * Content-Type is left unset on purpose — RN's native layer fills it in with the
 * multipart boundary (iOS RCTNetworking / Android OkHttp).
 */
export const uploadImageFromUri = async (
    uri: string,
    opts: { name?: string; type?: string } = {}
): Promise<string> => {
    const extension = (uri.split("?")[0] ?? "").split(".").pop()?.toLowerCase() ?? "";
    const type = opts.type || MIME_BY_EXTENSION[extension] || "image/jpeg";
    const name = opts.name || `upload.${MIME_BY_EXTENSION[extension] ? extension : "jpg"}`;

    const formData = new FormData();
    formData.append("file", { uri, name, type } as unknown as Blob);

    const response = await apiClient.post("/api/v1/upload/image", formData);

    const data = unwrapApiData<UploadResponse>(response.data);
    return data.url;
};
