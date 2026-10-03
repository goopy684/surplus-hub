"""Comprehensive tests for the embedding provider system.

Tests cover:
- Provider selection based on APP_ENV (Strategy Pattern)
- Embedding dimension validation
- build_search_text field combination and truncation
- Batch processing correctness
- Singleton pattern enforcement
- Error handling (OpenAI rate limit, missing API key warning)

All tests use unittest.mock — no real API calls are made.
"""

import warnings
from typing import List
from unittest.mock import MagicMock, patch, PropertyMock
import pytest

import app.ai.clients.embeddings as embeddings_module
from app.ai.clients.embeddings import (
    LocalEmbeddingProvider,
    OpenAIEmbeddingProvider,
    _get_provider,
    build_search_text,
    generate_embedding,
    generate_embeddings_batch,
)


# ---------------------------------------------------------------------------
# Helpers / Fixtures
# ---------------------------------------------------------------------------

def _reset_provider():
    """Reset the module-level singleton so each test starts fresh."""
    embeddings_module._provider = None


@pytest.fixture(autouse=True)
def reset_singleton():
    """Automatically reset the singleton before every test."""
    _reset_provider()
    yield
    _reset_provider()


def _make_vector(dim: int = 1024) -> List[float]:
    return [0.0] * dim


# ---------------------------------------------------------------------------
# 1. Provider Selection Tests
# ---------------------------------------------------------------------------

class TestProviderSelection:
    def test_local_provider_selected_when_app_env_local(self):
        """APP_ENV=local -> LocalEmbeddingProvider."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "local"), \
             patch.object(embeddings_module.settings, "APP_ENV", "local"):
            provider = _get_provider()
        assert isinstance(provider, LocalEmbeddingProvider)

    def test_openai_provider_selected_when_app_env_dev(self):
        """APP_ENV=dev -> OpenAIEmbeddingProvider."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "openai"), \
             patch.object(embeddings_module.settings, "APP_ENV", "dev"):
            provider = _get_provider()
        assert isinstance(provider, OpenAIEmbeddingProvider)

    def test_openai_provider_selected_when_app_env_stage(self):
        """APP_ENV=stage -> OpenAIEmbeddingProvider."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "openai"), \
             patch.object(embeddings_module.settings, "APP_ENV", "stage"):
            provider = _get_provider()
        assert isinstance(provider, OpenAIEmbeddingProvider)

    def test_openai_provider_selected_when_app_env_prod(self):
        """APP_ENV=prod -> OpenAIEmbeddingProvider."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "openai"), \
             patch.object(embeddings_module.settings, "APP_ENV", "prod"):
            provider = _get_provider()
        assert isinstance(provider, OpenAIEmbeddingProvider)


# ---------------------------------------------------------------------------
# 2. Embedding Dimension Tests
# ---------------------------------------------------------------------------

class TestEmbeddingDimension:
    def test_local_embedding_dimension(self):
        """LocalEmbeddingProvider.generate() returns 1024-dim vector."""
        provider = LocalEmbeddingProvider()
        mock_client = MagicMock()
        mock_item = MagicMock()
        mock_item.embedding = _make_vector(1024)
        mock_resp = MagicMock()
        mock_resp.data = [mock_item]
        mock_client.embeddings.create.return_value = mock_resp
        provider._client = mock_client

        result = provider.generate("test text")
        assert len(result) == 1024

    def test_local_embedding_batch_dimension(self):
        """LocalEmbeddingProvider.generate_batch() each vector is 1024-dim."""
        provider = LocalEmbeddingProvider()
        mock_client = MagicMock()
        mock_items = [MagicMock(index=i, embedding=_make_vector(1024)) for i in range(3)]
        mock_resp = MagicMock()
        mock_resp.data = mock_items
        mock_client.embeddings.create.return_value = mock_resp
        provider._client = mock_client

        results = provider.generate_batch(["a", "b", "c"])
        assert all(len(v) == 1024 for v in results)

    def test_openai_embedding_dimension(self):
        """OpenAIEmbeddingProvider.generate() returns 1024-dim vector."""
        provider = OpenAIEmbeddingProvider()

        mock_embedding_data = MagicMock()
        mock_embedding_data.embedding = _make_vector(1024)
        mock_response = MagicMock()
        mock_response.data = [mock_embedding_data]

        with patch.object(provider, "_call_api", return_value=mock_response):
            result = provider.generate("test text")

        assert len(result) == 1024

    def test_generate_embedding_top_level_dimension(self):
        """generate_embedding() public API returns 1024-dim vector."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "local"), \
             patch.object(embeddings_module.settings, "APP_ENV", "local"):
            provider = LocalEmbeddingProvider()
            mock_client = MagicMock()
            mock_item = MagicMock()
            mock_item.embedding = _make_vector(1024)
            mock_resp = MagicMock()
            mock_resp.data = [mock_item]
            mock_client.embeddings.create.return_value = mock_resp
            provider._client = mock_client
            embeddings_module._provider = provider

            result = generate_embedding("hello world")

        assert len(result) == 1024


# ---------------------------------------------------------------------------
# 3. build_search_text Tests
# ---------------------------------------------------------------------------

class TestBuildSearchText:
    def test_combines_title_only(self):
        """Title alone produces clean output."""
        result = build_search_text(title="철근 10mm")
        assert result == "철근 10mm"

    def test_combines_title_and_category(self):
        """Category is prefixed with '카테고리: '."""
        result = build_search_text(title="철근", category="철강류")
        assert "철근" in result
        assert "카테고리: 철강류" in result

    def test_combines_title_category_description(self):
        """All three fields appear in the result."""
        result = build_search_text(
            title="철근 10mm",
            category="철강류",
            description="신품 상태 철근입니다.",
        )
        assert "철근 10mm" in result
        assert "카테고리: 철강류" in result
        assert "신품 상태 철근입니다." in result

    def test_truncates_description_at_500_chars(self):
        """Descriptions longer than 500 chars are truncated."""
        long_desc = "A" * 600
        result = build_search_text(title="T", description=long_desc)
        # Only first 500 chars of description should appear
        assert "A" * 500 in result
        assert "A" * 501 not in result

    def test_does_not_truncate_description_at_exactly_500(self):
        """Description of exactly 500 chars is kept in full."""
        exact_desc = "B" * 500
        result = build_search_text(title="T", description=exact_desc)
        assert "B" * 500 in result

    def test_handles_none_description(self):
        """None description does not raise and is omitted."""
        result = build_search_text(title="철근", description=None)
        assert result == "철근"

    def test_handles_none_category(self):
        """None category does not raise and is omitted."""
        result = build_search_text(title="철근", category=None)
        assert result == "철근"

    def test_handles_all_none_optional_fields(self):
        """All optional fields None — title only."""
        result = build_search_text(title="철근", description=None, category=None)
        assert result == "철근"

    def test_output_is_joined_by_space(self):
        """Parts are space-joined."""
        result = build_search_text(title="A", category="B", description="C")
        parts = result.split(" ")
        assert "A" in parts


# ---------------------------------------------------------------------------
# 4. Batch Processing Tests
# ---------------------------------------------------------------------------

class TestBatchProcessing:
    def _make_openai_response(self, count: int):
        """Build a mock OpenAI batch response with `count` embeddings."""
        mock_response = MagicMock()
        items = []
        for i in range(count):
            item = MagicMock()
            item.index = i
            item.embedding = _make_vector(1024)
            items.append(item)
        mock_response.data = items
        return mock_response

    def test_batch_returns_correct_count_local(self):
        """LocalEmbeddingProvider.generate_batch returns one vector per input."""
        provider = LocalEmbeddingProvider()
        mock_client = MagicMock()
        mock_items = [MagicMock(index=i, embedding=_make_vector(1024)) for i in range(5)]
        mock_resp = MagicMock()
        mock_resp.data = mock_items
        mock_client.embeddings.create.return_value = mock_resp
        provider._client = mock_client

        results = provider.generate_batch(["t1", "t2", "t3", "t4", "t5"])
        assert len(results) == 5

    def test_batch_returns_correct_count_openai(self):
        """OpenAIEmbeddingProvider.generate_batch returns one vector per input."""
        provider = OpenAIEmbeddingProvider()
        mock_response = self._make_openai_response(5)

        with patch.object(provider, "_call_api", return_value=mock_response):
            results = provider.generate_batch(["t1", "t2", "t3", "t4", "t5"])

        assert len(results) == 5

    def test_batch_empty_input_local(self):
        """Empty list returns empty list for LocalEmbeddingProvider."""
        provider = LocalEmbeddingProvider()
        results = provider.generate_batch([])
        assert results == []

    def test_batch_empty_input_openai(self):
        """Empty list returns empty list for OpenAIEmbeddingProvider (no API call)."""
        provider = OpenAIEmbeddingProvider()
        with patch.object(provider, "_call_api") as mock_api:
            results = provider.generate_batch([])
        # No API call should have been made
        mock_api.assert_not_called()
        assert results == []

    def test_batch_top_level_api_local(self):
        """generate_embeddings_batch() public API returns correct count."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "local"), \
             patch.object(embeddings_module.settings, "APP_ENV", "local"):
            provider = LocalEmbeddingProvider()
            mock_client = MagicMock()
            mock_items = [MagicMock(index=i, embedding=_make_vector(1024)) for i in range(3)]
            mock_resp = MagicMock()
            mock_resp.data = mock_items
            mock_client.embeddings.create.return_value = mock_resp
            provider._client = mock_client
            embeddings_module._provider = provider

            results = generate_embeddings_batch(["a", "b", "c"])

        assert len(results) == 3


# ---------------------------------------------------------------------------
# 5. Singleton Pattern Test
# ---------------------------------------------------------------------------

class TestSingletonPattern:
    def test_provider_singleton_local(self):
        """_get_provider() returns the same instance on subsequent calls."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "local"), \
             patch.object(embeddings_module.settings, "APP_ENV", "local"):
            first = _get_provider()
            second = _get_provider()

        assert first is second

    def test_provider_singleton_openai(self):
        """Singleton holds for OpenAIEmbeddingProvider too."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "openai"), \
             patch.object(embeddings_module.settings, "APP_ENV", "dev"):
            first = _get_provider()
            second = _get_provider()

        assert first is second

    def test_singleton_reset_yields_new_instance(self):
        """After manual reset the next call creates a fresh instance."""
        with patch.object(embeddings_module.settings, "AI_PROVIDER", "local"), \
             patch.object(embeddings_module.settings, "APP_ENV", "local"):
            first = _get_provider()
            _reset_provider()
            second = _get_provider()

        # Both are LocalEmbeddingProvider but NOT the same object
        assert type(first) is type(second)
        assert first is not second


# ---------------------------------------------------------------------------
# 6. Error Handling Tests (OpenAI)
# ---------------------------------------------------------------------------

class TestOpenAIErrorHandling:
    def test_missing_api_key_raises_value_error(self):
        """OpenAIEmbeddingProvider._get_client() raises ValueError when no API key."""
        provider = OpenAIEmbeddingProvider()

        with patch.object(embeddings_module.settings, "OPENAI_API_KEY", None), \
             patch.object(embeddings_module.settings, "APP_ENV", "dev"):
            with pytest.raises(ValueError, match="OPENAI_API_KEY is required"):
                provider._get_client()

    def test_openai_missing_api_key_warning_at_init(self):
        """Settings warns when APP_ENV != 'local' and OPENAI_API_KEY is absent."""
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            # Import Settings directly to trigger __init__ with custom values
            from app.core.config import Settings
            Settings(
                APP_ENV="dev",
                AI_PROVIDER="openai",
                OPENAI_API_KEY=None,
                SECRET_KEY="a" * 32,
                CORS_ORIGINS=["https://example.com"],
            )

        warning_messages = [str(w.message) for w in caught]
        assert any("OPENAI_API_KEY" in msg for msg in warning_messages)

    def test_openai_retry_on_rate_limit(self):
        """RateLimitError on first call triggers retry; second call succeeds."""
        import openai

        provider = OpenAIEmbeddingProvider()

        # Build a valid mock client
        mock_client = MagicMock()
        provider._client = mock_client

        mock_embedding = MagicMock()
        mock_embedding.embedding = _make_vector(1024)
        mock_embedding.index = 0
        good_response = MagicMock()
        good_response.data = [mock_embedding]

        rate_limit_error = openai.RateLimitError(
            message="rate limit",
            response=MagicMock(status_code=429, headers={}),
            body={},
        )

        mock_client.embeddings.create.side_effect = [rate_limit_error, good_response]

        with patch("app.ai.clients.embeddings.settings") as mock_settings:
            mock_settings.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
            mock_settings.EMBEDDING_DIMENSION = 1024

            result = provider.generate("retry test")

        # Two calls: first raised, second succeeded
        assert mock_client.embeddings.create.call_count == 2
        assert len(result) == 1024

    def test_openai_generate_uses_configured_model_and_dimension(self):
        """generate() passes model and dimension from settings to the API."""
        provider = OpenAIEmbeddingProvider()

        mock_embedding = MagicMock()
        mock_embedding.embedding = _make_vector(1024)
        mock_response = MagicMock()
        mock_response.data = [mock_embedding]

        with patch.object(provider, "_call_api", return_value=mock_response) as mock_call:
            with patch("app.ai.clients.embeddings.settings") as mock_settings:
                mock_settings.EMBEDDING_DIMENSION = 1024

                provider.generate("hello")

            mock_call.assert_called_once_with("hello", dimensions=1024)
