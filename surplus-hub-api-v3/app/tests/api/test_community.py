"""Tests for Community (Posts & Comments) API endpoints.

Covers:
  - CRUD lifecycle for posts (create, read, update, delete)
  - Authorization checks (author-only update/delete, unauthenticated access)
  - Post likes (toggle on/off)
  - CRUD lifecycle for comments
  - Pagination metadata structure
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings

API = settings.API_V1_STR


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def _create_post(client: TestClient, headers: dict, **overrides) -> dict:
    """Create a post and return the response object."""
    payload = {
        "title": "Test Post",
        "content": "Content here",
        "category": "general",
    }
    payload.update(overrides)
    resp = client.post(f"{API}/community/posts", json=payload, headers=headers)
    return resp


# ===================================================================
# Posts - Public read endpoints
# ===================================================================

class TestListPosts:
    """GET /community/posts -- public, paginated."""

    def test_list_posts_returns_success(self, client: TestClient):
        response = client.get(f"{API}/community/posts")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert isinstance(body["data"], list)

    def test_list_posts_has_meta(self, client: TestClient):
        response = client.get(f"{API}/community/posts")
        body = response.json()
        meta = body["meta"]
        for key in ("totalCount", "page", "limit", "hasNextPage", "totalPages"):
            assert key in meta, f"Missing meta key: {key}"

    def test_list_posts_pagination_params(self, client: TestClient):
        response = client.get(f"{API}/community/posts", params={"page": 1, "limit": 5})
        assert response.status_code == 200
        assert response.json()["meta"]["limit"] == 5

    def test_list_posts_category_filter(self, client: TestClient):
        response = client.get(f"{API}/community/posts", params={"category": "general"})
        assert response.status_code == 200


# ===================================================================
# Posts - CRUD (requires auth)
# ===================================================================

class TestCreatePost:
    """POST /community/posts -- requires auth."""

    def test_create_post_without_auth_returns_401(self, client: TestClient):
        resp = client.post(
            f"{API}/community/posts",
            json={"title": "No Auth", "content": "Body", "category": "general"},
        )
        assert resp.status_code == 401

    def test_create_post_success(self, client: TestClient, auth_headers):
        resp = _create_post(client, auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        data = body["data"]
        assert data["title"] == "Test Post"
        assert data["content"] == "Content here"
        assert data["category"] == "general"
        assert "id" in data
        assert "authorId" in data
        assert "createdAt" in data

    def test_create_post_with_image_url(self, client: TestClient, auth_headers):
        resp = _create_post(
            client,
            auth_headers,
            title="Post With Image",
            imageUrl="https://example.com/img.png",
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["imageUrl"] == "https://example.com/img.png"


class TestGetPostDetail:
    """GET /community/posts/{id} -- public, increments views."""

    def test_get_nonexistent_post_returns_404(self, client: TestClient):
        resp = client.get(f"{API}/community/posts/999999")
        assert resp.status_code == 404

    def test_get_post_detail_success(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Detail Test")
        post_id = create_resp.json()["data"]["id"]

        resp = client.get(f"{API}/community/posts/{post_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["title"] == "Detail Test"
        assert body["data"]["views"] >= 1

    def test_get_post_increments_views(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="View Counter")
        post_id = create_resp.json()["data"]["id"]

        resp1 = client.get(f"{API}/community/posts/{post_id}")
        views_after_first = resp1.json()["data"]["views"]

        resp2 = client.get(f"{API}/community/posts/{post_id}")
        views_after_second = resp2.json()["data"]["views"]

        assert views_after_second == views_after_first + 1


class TestUpdatePost:
    """PUT /community/posts/{id} -- author only."""

    def test_update_post_without_auth_returns_401(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="To Update No Auth")
        post_id = create_resp.json()["data"]["id"]

        resp = client.put(
            f"{API}/community/posts/{post_id}",
            json={"title": "Updated", "content": "Updated", "category": "general"},
        )
        assert resp.status_code == 401

    def test_update_post_by_non_author_returns_403(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        create_resp = _create_post(client, auth_headers, title="Owner Only")
        post_id = create_resp.json()["data"]["id"]

        resp = client.put(
            f"{API}/community/posts/{post_id}",
            json={"title": "Hijacked", "content": "Nope", "category": "general"},
            headers=auth_headers2,
        )
        assert resp.status_code == 403

    def test_update_post_success(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Before Update")
        post_id = create_resp.json()["data"]["id"]

        resp = client.put(
            f"{API}/community/posts/{post_id}",
            json={"title": "After Update", "content": "New content", "category": "general"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "After Update"
        assert data["content"] == "New content"

    def test_update_nonexistent_post_returns_404(self, client: TestClient, auth_headers):
        resp = client.put(
            f"{API}/community/posts/999999",
            json={"title": "Ghost", "content": "Nope", "category": "general"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDeletePost:
    """DELETE /community/posts/{id} -- author only."""

    def test_delete_post_without_auth_returns_401(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Delete No Auth")
        post_id = create_resp.json()["data"]["id"]

        resp = client.delete(f"{API}/community/posts/{post_id}")
        assert resp.status_code == 401

    def test_delete_post_by_non_author_returns_403(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        create_resp = _create_post(client, auth_headers, title="Not Yours")
        post_id = create_resp.json()["data"]["id"]

        resp = client.delete(
            f"{API}/community/posts/{post_id}", headers=auth_headers2
        )
        assert resp.status_code == 403

    def test_delete_post_success(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="To Delete")
        post_id = create_resp.json()["data"]["id"]

        resp = client.delete(
            f"{API}/community/posts/{post_id}", headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

        # Confirm it is gone
        get_resp = client.get(f"{API}/community/posts/{post_id}")
        assert get_resp.status_code == 404

    def test_delete_post_with_likes_and_comments(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        """Likes/comments must not block deletion (post_likes FK used to 500)."""
        post_id = _create_post(client, auth_headers, title="Liked").json()["data"]["id"]
        client.post(f"{API}/community/posts/{post_id}/like", headers=auth_headers2)
        client.post(
            f"{API}/community/posts/{post_id}/comments",
            json={"content": "hi"},
            headers=auth_headers2,
        )

        resp = client.delete(f"{API}/community/posts/{post_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert client.get(f"{API}/community/posts/{post_id}").status_code == 404

    def test_delete_nonexistent_post_returns_404(self, client: TestClient, auth_headers):
        resp = client.delete(
            f"{API}/community/posts/999999", headers=auth_headers
        )
        assert resp.status_code == 404


# ===================================================================
# Post Likes (toggle)
# ===================================================================

class TestPostLike:
    """POST /community/posts/{id}/like -- toggles like for current user."""

    def test_like_without_auth_returns_401(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Like No Auth")
        post_id = create_resp.json()["data"]["id"]

        resp = client.post(f"{API}/community/posts/{post_id}/like")
        assert resp.status_code == 401

    def test_like_nonexistent_post_returns_404(self, client: TestClient, auth_headers):
        resp = client.post(
            f"{API}/community/posts/999999/like", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_toggle_like_on_and_off(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Toggle Like")
        post_id = create_resp.json()["data"]["id"]

        # First toggle -> liked
        resp1 = client.post(
            f"{API}/community/posts/{post_id}/like", headers=auth_headers
        )
        assert resp1.status_code == 200
        data1 = resp1.json()["data"]
        assert data1["isLiked"] is True

        # Second toggle -> unliked
        resp2 = client.post(
            f"{API}/community/posts/{post_id}/like", headers=auth_headers
        )
        assert resp2.status_code == 200
        data2 = resp2.json()["data"]
        assert data2["isLiked"] is False


# ===================================================================
# Comments
# ===================================================================

class TestListComments:
    """GET /community/posts/{id}/comments -- public."""

    def test_list_comments_on_nonexistent_post_returns_404(self, client: TestClient):
        resp = client.get(f"{API}/community/posts/999999/comments")
        assert resp.status_code == 404

    def test_list_comments_empty(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="No Comments")
        post_id = create_resp.json()["data"]["id"]

        resp = client.get(f"{API}/community/posts/{post_id}/comments")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert isinstance(body["data"], list)
        assert "meta" in body


class TestCreateComment:
    """POST /community/posts/{id}/comments -- requires auth."""

    def test_create_comment_without_auth_returns_401(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Comment No Auth")
        post_id = create_resp.json()["data"]["id"]

        resp = client.post(
            f"{API}/community/posts/{post_id}/comments",
            json={"content": "Nice post!"},
        )
        assert resp.status_code == 401

    def test_create_comment_on_nonexistent_post_returns_404(
        self, client: TestClient, auth_headers
    ):
        resp = client.post(
            f"{API}/community/posts/999999/comments",
            json={"content": "Ghost comment"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_create_comment_success(self, client: TestClient, auth_headers):
        create_resp = _create_post(client, auth_headers, title="Comment Target")
        post_id = create_resp.json()["data"]["id"]

        resp = client.post(
            f"{API}/community/posts/{post_id}/comments",
            json={"content": "Nice post!"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["content"] == "Nice post!"
        assert data["postId"] == post_id
        assert "authorId" in data
        assert "authorName" in data
        assert "createdAt" in data


class TestUpdateComment:
    """PUT /community/posts/{post_id}/comments/{comment_id} -- author only."""

    def _create_post_and_comment(self, client, auth_headers):
        post_resp = _create_post(client, auth_headers, title="Comment CRUD")
        post_id = post_resp.json()["data"]["id"]

        comment_resp = client.post(
            f"{API}/community/posts/{post_id}/comments",
            json={"content": "Original comment"},
            headers=auth_headers,
        )
        comment_id = comment_resp.json()["data"]["id"]
        return post_id, comment_id

    def test_update_comment_without_auth_returns_401(
        self, client: TestClient, auth_headers
    ):
        post_id, comment_id = self._create_post_and_comment(client, auth_headers)

        resp = client.put(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            json={"content": "Hacked"},
        )
        assert resp.status_code == 401

    def test_update_comment_by_non_author_returns_403(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        post_id, comment_id = self._create_post_and_comment(client, auth_headers)

        resp = client.put(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            json={"content": "Not yours"},
            headers=auth_headers2,
        )
        assert resp.status_code == 403

    def test_update_comment_success(self, client: TestClient, auth_headers):
        post_id, comment_id = self._create_post_and_comment(client, auth_headers)

        resp = client.put(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            json={"content": "Updated comment"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["content"] == "Updated comment"

    def test_update_nonexistent_comment_returns_404(
        self, client: TestClient, auth_headers
    ):
        post_resp = _create_post(client, auth_headers, title="No Comment Here")
        post_id = post_resp.json()["data"]["id"]

        resp = client.put(
            f"{API}/community/posts/{post_id}/comments/999999",
            json={"content": "Ghost"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestDeleteComment:
    """DELETE /community/posts/{post_id}/comments/{comment_id} -- author only."""

    def _create_post_and_comment(self, client, auth_headers):
        post_resp = _create_post(client, auth_headers, title="Comment Delete")
        post_id = post_resp.json()["data"]["id"]

        comment_resp = client.post(
            f"{API}/community/posts/{post_id}/comments",
            json={"content": "To be deleted"},
            headers=auth_headers,
        )
        comment_id = comment_resp.json()["data"]["id"]
        return post_id, comment_id

    def test_delete_comment_without_auth_returns_401(
        self, client: TestClient, auth_headers
    ):
        post_id, comment_id = self._create_post_and_comment(client, auth_headers)

        resp = client.delete(
            f"{API}/community/posts/{post_id}/comments/{comment_id}"
        )
        assert resp.status_code == 401

    def test_delete_comment_by_non_author_returns_403(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        post_id, comment_id = self._create_post_and_comment(client, auth_headers)

        resp = client.delete(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            headers=auth_headers2,
        )
        assert resp.status_code == 403

    def test_delete_comment_success(self, client: TestClient, auth_headers):
        post_id, comment_id = self._create_post_and_comment(client, auth_headers)

        resp = client.delete(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_delete_nonexistent_comment_returns_404(
        self, client: TestClient, auth_headers
    ):
        post_resp = _create_post(client, auth_headers, title="No Comment Delete")
        post_id = post_resp.json()["data"]["id"]

        resp = client.delete(
            f"{API}/community/posts/{post_id}/comments/999999",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ===================================================================
# Full lifecycle integration test
# ===================================================================

class TestCommunityLifecycle:
    """End-to-end: create post -> get detail -> comment -> update comment -> delete."""

    def test_full_lifecycle(self, client: TestClient, auth_headers, auth_headers2):
        # 1. Create a post
        create_resp = _create_post(client, auth_headers, title="Lifecycle Post")
        assert create_resp.status_code == 200
        post_id = create_resp.json()["data"]["id"]

        # 2. Read the post detail (increments views)
        detail_resp = client.get(f"{API}/community/posts/{post_id}")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["data"]["views"] >= 1

        # 3. Another user adds a comment
        comment_resp = client.post(
            f"{API}/community/posts/{post_id}/comments",
            json={"content": "Great post!"},
            headers=auth_headers2,
        )
        assert comment_resp.status_code == 200
        comment_id = comment_resp.json()["data"]["id"]

        # 4. Comment author updates it
        update_comment_resp = client.put(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            json={"content": "Actually, excellent post!"},
            headers=auth_headers2,
        )
        assert update_comment_resp.status_code == 200
        assert update_comment_resp.json()["data"]["content"] == "Actually, excellent post!"

        # 5. Post author cannot delete another user's comment
        forbid_resp = client.delete(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            headers=auth_headers,
        )
        assert forbid_resp.status_code == 403

        # 6. Comment author deletes their own comment
        del_comment_resp = client.delete(
            f"{API}/community/posts/{post_id}/comments/{comment_id}",
            headers=auth_headers2,
        )
        assert del_comment_resp.status_code == 200

        # 7. Like the post, then unlike it (to clean up FK references)
        like_resp = client.post(
            f"{API}/community/posts/{post_id}/like", headers=auth_headers
        )
        assert like_resp.status_code == 200
        assert like_resp.json()["data"]["isLiked"] is True

        unlike_resp = client.post(
            f"{API}/community/posts/{post_id}/like", headers=auth_headers
        )
        assert unlike_resp.status_code == 200
        assert unlike_resp.json()["data"]["isLiked"] is False

        # 8. Post appears in the list (use large limit to account for other tests' data)
        list_resp = client.get(f"{API}/community/posts", params={"limit": 100})
        assert list_resp.status_code == 200
        post_ids = [p["id"] for p in list_resp.json()["data"]]
        assert post_id in post_ids

        # 9. Author deletes the post (no FK references remain)
        del_resp = client.delete(
            f"{API}/community/posts/{post_id}", headers=auth_headers
        )
        assert del_resp.status_code == 200

        # 10. Confirm it is gone
        gone_resp = client.get(f"{API}/community/posts/{post_id}")
        assert gone_resp.status_code == 404
