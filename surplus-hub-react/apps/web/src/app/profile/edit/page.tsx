"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useCurrentUser, useUpdateProfile, useUploadImage } from "@repo/core";
import { AuthGate } from "../../../components/AuthGate";

function ProfileEditContent() {
  const router = useRouter();
  const { data: currentUser, isLoading } = useCurrentUser();
  const { mutate: updateProfile, isPending: isSaving } = useUpdateProfile();
  const { mutateAsync: uploadImage, isPending: isUploading } = useUploadImage();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name ?? "");
      setLocation(currentUser.location ?? "");
      setPreviewUrl(currentUser.profileImageUrl ?? null);
    }
  }, [currentUser]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("이미지 크기는 5MB 이하여야 합니다.");
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }

    try {
      let profile_image_url: string | undefined = undefined;

      if (imageFile) {
        profile_image_url = await uploadImage(imageFile);
      } else if (previewUrl && !previewUrl.startsWith("blob:")) {
        // 기존 이미지 유지
        profile_image_url = previewUrl;
      }

      updateProfile(
        {
          name: name.trim(),
          location: location.trim() || undefined,
          profile_image_url,
        },
        {
          onSuccess: () => {
            alert("프로필이 수정되었습니다.");
            router.push("/profile");
          },
          onError: () => {
            alert("프로필 수정에 실패했습니다. 다시 시도해주세요.");
          },
        }
      );
    } catch {
      alert("이미지 업로드에 실패했습니다. 다시 시도해주세요.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const isPending = isSaving || isUploading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-4">
        <button
          onClick={() => router.back()}
          className="text-foreground"
          disabled={isPending}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-6 w-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-foreground">프로필 수정</h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* 프로필 이미지 */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="h-24 w-24 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="프로필 이미지"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-primary">
                  {(name || "U").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground card-shadow hover:bg-primary/90"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
                />
              </svg>
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageChange}
            accept="image/*"
            className="hidden"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-btn border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              이미지 변경
            </button>
            {previewUrl && (
              <button
                type="button"
                onClick={handleRemoveImage}
                className="rounded-btn border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              >
                이미지 제거
              </button>
            )}
          </div>
        </div>

        {/* 이름 */}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
            이름
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 입력하세요"
            className="w-full rounded-field border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        {/* 위치 */}
        <div>
          <label htmlFor="location" className="mb-2 block text-sm font-medium text-foreground">
            위치
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 서울특별시 강남구"
            className="w-full rounded-field border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="flex-1 rounded-btn border border-border bg-card py-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-btn bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {isPending && (
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isUploading ? "이미지 업로드 중..." : isSaving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProfileEditPage() {
  return (
    <AuthGate title="프로필 수정은 로그인 후 이용 가능합니다">
      <ProfileEditContent />
    </AuthGate>
  );
}
