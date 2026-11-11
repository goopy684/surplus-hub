import { apiClient, unwrapApiData } from "./client";

export interface UploadResponse {
    url: string;
}

// 모바일 고해상도 사진을 R2로 올리는 동안 기본 axios timeout으로는 부족하다
const UPLOAD_TIMEOUT_MS = 60000;
const COMPRESS_THRESHOLD_BYTES = 500 * 1024;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.82;

type PreviewableFile = File & { __previewDataUrl?: string };

/** `data:<mime>;base64,<payload>` → 메모리 상의 File. 형식이 아니면 null. */
export const dataUrlToFile = (
    dataUrl: string,
    filename = "image.jpg",
    fallbackType = "image/jpeg"
): File | null => {
    const match = /^data:([^;,]*)(?:;[^;,]*)*;base64,([\s\S]*)$/.exec(dataUrl);
    if (!match) return null;
    try {
        const binary = atob(match[2] ?? "");
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], filename, { type: match[1] || fallbackType });
    } catch {
        return null;
    }
};

const readAsDataUrl = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

/**
 * 큰 사진(> 500KB)을 canvas로 최대 변 1600px·JPEG 0.82로 줄인다.
 * canvas/objectURL이 없는 환경(SSR·JSDOM)이나 디코딩 실패(HEIC 등)면 원본을 그대로 돌려준다.
 */
export const compressImageIfNeeded = async (file: File): Promise<File> => {
    if (
        typeof document === "undefined" ||
        typeof URL.createObjectURL !== "function" ||
        file.size <= COMPRESS_THRESHOLD_BYTES
    ) {
        return file;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("image decode failed"));
            el.src = objectUrl;
        });
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
        );
        if (!blob || blob.size >= file.size) return file;
        const name = (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg" });
    } catch {
        return file;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

export const uploadImage = async (file: File): Promise<string> => {
    const upload = await compressImageIfNeeded(file);
    const formData = new FormData();
    formData.append("file", upload);

    try {
        const response = await apiClient.post("/api/v1/upload/image", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
            timeout: UPLOAD_TIMEOUT_MS,
        });
        return unwrapApiData<UploadResponse>(response.data).url;
    } catch (err) {
        // 서버가 응답해 4xx로 거절한 건 JSON으로 다시 보내도 같다. 네트워크·타임아웃·5xx만 폴백한다.
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status !== undefined && status < 500) throw err;

        // Android ERR_UPLOAD_FILE_CHANGED·NotReadableError 등 multipart가 막히는 인앱 브라우저용 JSON 폴백.
        // 압축본은 메모리 파일이라 다시 읽을 수 있고, 원본은 선택 시 저장해 둔 미리보기를 우선 쓴다.
        const dataUrl = (upload as PreviewableFile).__previewDataUrl ?? (await readAsDataUrl(upload));
        const response = await apiClient.post(
            "/api/v1/upload/image-base64",
            { dataUrl, filename: upload.name || "image.jpg" },
            { timeout: UPLOAD_TIMEOUT_MS }
        );
        return unwrapApiData<UploadResponse>(response.data).url;
    }
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
