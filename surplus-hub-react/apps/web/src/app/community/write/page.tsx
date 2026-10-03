"use client";

import { useCreateCommunityPost, useUploadImage } from "@repo/core";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { AuthGate } from "../../../components/AuthGate";

const CATEGORY_OPTIONS = [
    { label: "질문/답변", value: "QnA" },
    { label: "노하우", value: "KnowHow" },
    { label: "안전", value: "Safety" },
    { label: "정보", value: "Info" },
];

function CommunityWriteContent() {
    const router = useRouter();
    const { mutate: createPost, isPending: isCreating } = useCreateCommunityPost();
    const { mutateAsync: uploadImage, isPending: isUploading } = useUploadImage();

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [category, setCategory] = useState(CATEGORY_OPTIONS[0]?.value || "");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB Limit
                alert("이미지 크기는 5MB 이하여야 합니다.");
                return;
            }
            setImageFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const removeImage = () => {
        setImageFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim() || !content.trim()) {
            alert("제목과 내용을 입력해주세요.");
            return;
        }

        try {
            let imageUrl = undefined;

            if (imageFile) {
                imageUrl = await uploadImage(imageFile);
            }

            createPost(
                {
                    title,
                    content,
                    category,
                    imageUrl,
                },
                {
                    onSuccess: () => {
                        alert("게시글이 등록되었습니다.");
                        router.push("/community");
                    },
                    onError: () => {
                        alert("게시글 등록에 실패했습니다.");
                    },
                }
            );
        } catch {
            alert("이미지 업로드에 실패했습니다. 다시 시도해주세요.");
        }
    };

    const isPending = isCreating || isUploading;

    return (
        <div className="mx-auto max-w-2xl px-4 py-8">
            <h1 className="mb-6 text-2xl font-bold text-foreground">새 게시글 작성</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* 카테고리 선택 */}
                <div>
                    <label htmlFor="category" className="mb-2 block text-sm font-medium text-muted-foreground">
                        카테고리
                    </label>
                    <select
                        id="category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="block w-full rounded-field border border-border bg-card p-2.5 text-sm text-foreground focus:border-primary focus:ring-primary"
                    >
                        {CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 제목 입력 */}
                <div>
                    <label htmlFor="title" className="mb-2 block text-sm font-medium text-muted-foreground">
                        제목
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="제목을 입력하세요"
                        className="block w-full rounded-field border border-border bg-field p-2.5 text-sm text-foreground focus:border-primary focus:ring-primary"
                        required
                    />
                </div>

                {/* 내용 입력 */}
                <div>
                    <label htmlFor="content" className="mb-2 block text-sm font-medium text-muted-foreground">
                        내용
                    </label>
                    <textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={10}
                        placeholder="내용을 입력하세요"
                        className="block w-full rounded-field border border-border bg-field p-2.5 text-sm text-foreground focus:border-primary focus:ring-primary"
                        required
                    />
                </div>

                {/* 이미지 첨부 영역 */}
                <div>
                    <label htmlFor="post-image" className="mb-2 block text-sm font-medium text-muted-foreground">이미지 첨부</label>
                    <input
                        id="post-image"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        accept="image/*"
                        className="hidden"
                    />

                    {!previewUrl && (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 rounded-btn border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-muted-foreground">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                            </svg>
                            이미지 추가하기
                        </button>
                    )}

                    {previewUrl && (
                        <div className="relative mt-2 inline-block">
                            <div className="h-40 w-40 overflow-hidden rounded-thumb border border-border">
                                <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                            </div>
                            <button
                                type="button"
                                onClick={removeImage}
                                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-card hover:opacity-90"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* 버튼 영역 */}
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        disabled={isPending}
                        className="rounded-btn border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-4 focus:ring-border disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark focus:outline-none focus:ring-4 focus:ring-primary-light disabled:opacity-50 flex items-center gap-2"
                    >
                        {isPending && (
                            <svg className="animate-spin h-4 w-4 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {isUploading ? "이미지 업로드 중..." : isCreating ? "등록 중..." : "등록하기"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function CommunityWritePage() {
    return (
        <AuthGate title="로그인 후 글쓰기 가능" description="게시글을 작성하려면 로그인이 필요합니다.">
            <CommunityWriteContent />
        </AuthGate>
    );
}
