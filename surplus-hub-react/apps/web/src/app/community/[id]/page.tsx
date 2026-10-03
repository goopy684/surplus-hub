"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  fetchCommunityPost,
  fetchComments,
  createComment,
  togglePostLike,
  updateCommunityPost,
  deleteCommunityPost,
  updateComment,
  deleteComment,
  getCommunityAnswer,
  summarizeDiscussion,
  CommunityComment,
  CommunityPost,
  useCurrentUser,
} from "@repo/core";

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const { data: currentUser } = useCurrentUser();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAiAnswer, setShowAiAnswer] = useState(false);
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false);
  const [aiAnswerContent, setAiAnswerContent] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryItems, setSummaryItems] = useState<string[]>([]);

  const [newComment, setNewComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);

  // 게시글 수정 상태
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [postActionLoading, setPostActionLoading] = useState(false);

  // 댓글 수정 상태
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [commentActionLoading, setCommentActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const [postData, commentsData] = await Promise.all([
        fetchCommunityPost(postId),
        fetchComments(postId),
      ]);
      setPost(postData);
      setComments(commentsData);
    } catch {
      setError("게시글을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleShowAiAnswer = async () => {
    if (!post) return;
    setAiAnswerLoading(true);
    try {
      const result = await getCommunityAnswer(postId, post.title, post.content);
      setAiAnswerContent(result.answer);
      setShowAiAnswer(true);
    } catch {
      setAiAnswerContent("AI 답변을 가져오는 데 실패했습니다. 잠시 후 다시 시도해주세요.");
      setShowAiAnswer(true);
    } finally {
      setAiAnswerLoading(false);
    }
  };

  const handleShowSummary = async () => {
    setSummaryLoading(true);
    try {
      const result = await summarizeDiscussion(
        postId,
        comments.map((c) => ({ author: c.authorName, content: c.content }))
      );
      setSummaryItems(result.summary);
      setShowSummary(true);
    } catch {
      setSummaryItems(["댓글 요약을 가져오는 데 실패했습니다."]);
      setShowSummary(true);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const created = await createComment(postId, newComment.trim());
      setComments((prev) => [...prev, created]);
      setNewComment("");
    } catch {
      alert("댓글 작성에 실패했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleToggleLike = async () => {
    if (!post) return;
    try {
      const result = await togglePostLike(postId);
      setLiked(result.liked);
      setPost((prev) =>
        prev ? { ...prev, likesCount: result.likesCount } : prev
      );
    } catch {
      alert("좋아요 처리에 실패했습니다. 다시 시도해주세요.");
    }
  };

  // 게시글 수정 시작
  const handleStartEditPost = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditContent(post.content);
    setIsEditingPost(true);
  };

  // 게시글 수정 저장
  const handleSavePost = async () => {
    if (!post || !editTitle.trim() || !editContent.trim()) return;
    setPostActionLoading(true);
    try {
      const updated = await updateCommunityPost(postId, {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: post.category,
        imageUrl: post.imageUrl,
      });
      setPost(updated);
      setIsEditingPost(false);
    } catch {
      alert("게시글 수정에 실패했습니다.");
    } finally {
      setPostActionLoading(false);
    }
  };

  // 게시글 삭제
  const handleDeletePost = async () => {
    if (!window.confirm("게시글을 삭제하시겠습니까?")) return;
    setPostActionLoading(true);
    try {
      await deleteCommunityPost(postId);
      router.push("/community");
    } catch {
      alert("게시글 삭제에 실패했습니다.");
      setPostActionLoading(false);
    }
  };

  // 댓글 수정 시작
  const handleStartEditComment = (comment: CommunityComment) => {
    setEditingCommentId(comment.id);
    setEditCommentContent(comment.content);
  };

  // 댓글 수정 저장
  const handleSaveComment = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    setCommentActionLoading(true);
    try {
      const updated = await updateComment(postId, commentId, editCommentContent.trim());
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c))
      );
      setEditingCommentId(null);
      setEditCommentContent("");
    } catch {
      alert("댓글 수정에 실패했습니다.");
    } finally {
      setCommentActionLoading(false);
    }
  };

  // 댓글 삭제
  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("댓글을 삭제하시겠습니까?")) return;
    setCommentActionLoading(true);
    try {
      await deleteComment(postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      alert("댓글 삭제에 실패했습니다.");
    } finally {
      setCommentActionLoading(false);
    }
  };

  const formatRelativeTime = (dateStr: string): string => {
    const now = Date.now();
    const diff = now - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="mb-4 text-sm text-muted-foreground">{error || "게시글을 찾을 수 없습니다."}</p>
        <button
          onClick={() => router.push("/community")}
          className="rounded-btn bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const isPostAuthor = currentUser && post.authorId && currentUser.id === post.authorId;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-4">
        <button onClick={() => router.push("/community")} className="text-foreground">
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
        <h1 className="text-base font-semibold text-foreground">{post.category}</h1>
        {isPostAuthor && !isEditingPost && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleStartEditPost}
              disabled={postActionLoading}
              className="rounded-chip px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              수정
            </button>
            <button
              onClick={handleDeletePost}
              disabled={postActionLoading}
              className="rounded-chip px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              삭제
            </button>
          </div>
        )}
      </header>

      {/* Post Section */}
      <div className="border-b border-border bg-card p-4">
        <div className="mb-3 inline-block rounded-chip border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {post.category}
        </div>

        {isEditingPost ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-field border border-border bg-muted px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="제목을 입력하세요"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={6}
              className="w-full rounded-field border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="내용을 입력하세요"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditingPost(false)}
                disabled={postActionLoading}
                className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSavePost}
                disabled={postActionLoading || !editTitle.trim() || !editContent.trim()}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {postActionLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-2 text-base font-bold text-foreground">
              {post.title}
            </h2>
            <p className="mb-3 text-sm leading-relaxed text-foreground">
              {post.content}
            </p>
          </>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{post.authorName}</span>
          <span>{formatRelativeTime(post.createdAt)}</span>
          <div className="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
            <span>{post.views}</span>
          </div>
          <button onClick={handleToggleLike} className="flex items-center gap-1 transition-colors hover:text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill={liked ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`h-4 w-4 ${liked ? "text-primary" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
            <span>{post.likesCount}</span>
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* AI Answer Bot Button (shown before AI answer) */}
        {!showAiAnswer && !aiAnswerLoading && (
          <button
            onClick={handleShowAiAnswer}
            className="mb-4 w-full rounded-btn border border-border bg-card p-4 card-shadow transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-center gap-2 text-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                />
              </svg>
              <span className="font-medium">AI 기술 답변 보기</span>
            </div>
          </button>
        )}

        {/* AI Loading State */}
        {aiAnswerLoading && (
          <div className="mb-4 flex items-center gap-3 rounded-thumb border border-border bg-card p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-5 w-5 animate-spin text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <span className="text-sm text-muted-foreground">AI가 기술 자료를 검색 중...</span>
          </div>
        )}

        {/* AI Answer Card */}
        {showAiAnswer && (
          <div className="mb-4 rounded-thumb border border-border bg-accent p-4">
            {/* Header */}
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                  className="h-5 w-5 text-primary-foreground"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                  />
                </svg>
              </div>
              <span className="font-medium text-foreground">AI 기술 어시스턴트</span>
              <span className="ml-auto flex items-center gap-1 rounded-chip bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                AI
              </span>
            </div>

            {/* Body */}
            <div className="mb-3 space-y-2 text-sm text-foreground whitespace-pre-line">
              {aiAnswerContent}
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground">
              * AI 답변은 참고용이며, 전문가 확인을 권장합니다.
            </p>
          </div>
        )}

        {/* Comments Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
            <span>댓글 {comments.length}</span>
          </div>
          {comments.length > 0 && (
            <button
              onClick={handleShowSummary}
              disabled={summaryLoading}
              className="flex items-center gap-1.5 rounded-btn bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              AI 요약
            </button>
          )}
        </div>

        {/* AI Summary Loading */}
        {summaryLoading && (
          <div className="mb-4 flex items-center gap-3 rounded-thumb border border-border bg-card p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-5 w-5 animate-spin text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <span className="text-sm text-muted-foreground">댓글을 요약하는 중...</span>
          </div>
        )}

        {/* AI Summary Box */}
        {showSummary && summaryItems.length > 0 && (
          <div className="mb-4 rounded-thumb border border-border bg-accent p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              댓글 요약
            </div>
            <ul className="space-y-1.5 text-sm text-foreground">
              {summaryItems.map((item, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Comments List */}
        <div className="space-y-4">
          {comments.map((comment) => {
            const isCommentAuthor = currentUser && comment.authorId && currentUser.id === comment.authorId;
            const isEditingThis = editingCommentId === comment.id;

            return (
              <div key={comment.id} className="flex gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                  {comment.authorName[0]}
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">{comment.authorName}</span>
                    <span className="text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                    {isCommentAuthor && !isEditingThis && (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => handleStartEditComment(comment)}
                          disabled={commentActionLoading}
                          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          disabled={commentActionLoading}
                          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditingThis ? (
                    <div className="space-y-2">
                      <textarea
                        value={editCommentContent}
                        onChange={(e) => setEditCommentContent(e.target.value)}
                        rows={3}
                        className="w-full rounded-field border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditCommentContent("");
                          }}
                          disabled={commentActionLoading}
                          className="rounded-btn border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => handleSaveComment(comment.id)}
                          disabled={commentActionLoading || !editCommentContent.trim()}
                          className="rounded-btn bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                          {commentActionLoading ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-sm text-foreground">{comment.content}</p>
                      <button className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-4 w-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                          />
                        </svg>
                        <span>{comment.likesCount}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Comment Input */}
        <div className="mt-6 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmitComment();
              }
            }}
            placeholder="댓글을 입력하세요..."
            className="flex-1 rounded-field border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || commentSubmitting}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {commentSubmitting ? "..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
