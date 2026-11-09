"""
Tests for /api/v1/ai/ endpoints (Phase 2 & 3).

All AI services (Gemini, OpenAI, embeddings) are mocked.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.schemas.ai_schemas import (
    ChatSuggestionResponse,
    CommunityAnswerResponse,
    DescriptionGenerateResponse,
    ImageAnalysisResponse,
    PriceSuggestResponse,
    SummarizeResponse,
    TranslateResponse,
)

API_V1_STR = "/api/v1"


# ===== IMAGE ANALYSIS =====


class TestAnalyzeImage:
    """POST /api/v1/ai/analyze-image"""

    def test_analyze_image_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/analyze-image",
            json={"imageUrl": "https://example.com/img.jpg"},
        )
        assert response.status_code == 401

    @patch("app.ai.services.registration.analyze_material_image")
    def test_analyze_image_success(
        self, mock_analyze, client: TestClient, auth_headers: dict
    ):
        mock_analyze.return_value = ImageAnalysisResponse(
            category="철근",
            tags=["H빔", "구조용", "건설"],
            titleSuggestion="H빔 잉여자재",
            condition="양호",
            materialType="H빔",
            confidence=0.92,
        )

        response = client.post(
            f"{API_V1_STR}/ai/analyze-image",
            json={"imageUrl": "https://example.com/hbeam.jpg"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["category"] == "철근"
        assert data["confidence"] == 0.92
        assert len(data["tags"]) == 3

    @patch("app.ai.services.registration.analyze_material_image")
    def test_analyze_image_service_error_returns_502(
        self, mock_analyze, client: TestClient, auth_headers: dict
    ):
        mock_analyze.side_effect = Exception("Gemini API error")

        response = client.post(
            f"{API_V1_STR}/ai/analyze-image",
            json={"imageUrl": "https://example.com/bad.jpg"},
            headers=auth_headers,
        )
        assert response.status_code == 502

    @patch("app.ai.services.registration.analyze_image")
    def test_analyze_image_normalizes_category_and_grade(
        self, mock_vision, client: TestClient, auth_headers: dict
    ):
        """Vision 원본 출력이 업종 카테고리 + 상/중/하로 정규화된다."""
        from app.crud.crud_category import TRADE_CATEGORIES

        mock_vision.return_value = {
            "category": "배관",
            "condition": "새제품",
            "tags": ["SUS"],
            "material_type": "SUS304 배관 25A",
            "confidence": 0.8,
        }

        response = client.post(
            f"{API_V1_STR}/ai/analyze-image",
            json={"imageUrl": "https://example.com/pipe.jpg"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["category"] == "설비"
        assert data["condition"] == "상"
        assert data["materialType"] == "SUS304 배관 25A"
        assert mock_vision.call_args.kwargs["categories"] == list(TRADE_CATEGORIES)


class TestVisionNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("문/창호", "문/창호"),
            ("문창호", "문/창호"),
            ("샷시", "문/창호"),
            ("새시", "문/창호"),
            ("배관", "설비"),
            ("밸브", "설비"),
            ("위생도기", "설비"),
            ("LED 등기구", "조명"),
            ("led", "조명"),
            ("전선", "전기"),
            ("차단기", "전기"),
            ("철근", "건축자재"),
            ("석고보드", "건축자재"),
            ("H빔", "건축자재"),
            ("기타", "기타"),
            ("알수없음", "기타"),
            (None, "기타"),
        ],
    )
    def test_normalize_category(self, raw, expected):
        from app.ai.services.registration import _normalize_category

        assert _normalize_category(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("상", "상"),
            ("새제품", "상"),
            ("미개봉", "상"),
            ("양호", "상"),
            ("a", "상"),
            ("보통", "중"),
            ("B", "중"),
            ("사용감 있음", "하"),
            ("사용감있음", "하"),
            ("불량", "하"),
            ("C", "하"),
            ("모름", None),
            (None, None),
        ],
    )
    def test_normalize_condition_grade(self, raw, expected):
        from app.ai.services.registration import _normalize_condition_grade

        assert _normalize_condition_grade(raw) == expected


# ===== DESCRIPTION GENERATION =====


class TestGenerateDescription:
    """POST /api/v1/ai/generate-description"""

    def test_generate_description_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/generate-description",
            json={"title": "H빔"},
        )
        assert response.status_code == 401

    @patch("app.ai.services.registration.generate_material_description")
    def test_generate_description_success(
        self, mock_gen, client: TestClient, auth_headers: dict
    ):
        mock_gen.return_value = DescriptionGenerateResponse(
            description="건설현장에서 남은 H빔 10개입니다. 상태 양호하며 즉시 사용 가능합니다.",
            modelUsed="gpt-5-nano",
        )

        response = client.post(
            f"{API_V1_STR}/ai/generate-description",
            json={
                "title": "H빔 잉여",
                "tags": ["H빔", "구조용"],
                "category": "철근",
                "condition": "양호",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert "H빔" in data["description"]
        assert data["modelUsed"] == "gpt-5-nano"


# ===== PRICE SUGGESTION =====


class TestSuggestPrice:
    """POST /api/v1/ai/suggest-price"""

    def test_suggest_price_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/suggest-price",
            json={"title": "H빔"},
        )
        assert response.status_code == 401

    @patch("app.ai.services.registration.suggest_material_price")
    def test_suggest_price_success(
        self, mock_suggest, client: TestClient, auth_headers: dict
    ):
        mock_suggest.return_value = PriceSuggestResponse(
            suggestedPrice=120000,
            priceRangeLow=100000,
            priceRangeHigh=150000,
            reasoning="유사 매물 5건 평균가 기준",
            similarCount=5,
        )

        response = client.post(
            f"{API_V1_STR}/ai/suggest-price",
            json={"title": "H빔 10개", "category": "철근"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["suggestedPrice"] == 120000
        assert data["similarCount"] == 5


# ===== CHAT SUGGESTIONS =====


class TestChatSuggestions:
    """POST /api/v1/ai/chat-suggestions"""

    def test_chat_suggestions_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/chat-suggestions",
            json={"roomId": 1},
        )
        assert response.status_code == 401

    @patch("app.ai.services.qa_bot.generate_chat_suggestions")
    def test_chat_suggestions_success(
        self, mock_chat, client: TestClient, auth_headers: dict
    ):
        mock_chat.return_value = ChatSuggestionResponse(
            suggestions=["네, 가능합니다.", "가격 조정 가능한가요?", "직거래 원합니다."]
        )

        response = client.post(
            f"{API_V1_STR}/ai/chat-suggestions",
            json={"roomId": 1},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data["suggestions"]) == 3


# ===== COMMUNITY ANSWER =====


class TestCommunityAnswer:
    """POST /api/v1/ai/community-answer"""

    def test_community_answer_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/community-answer",
            json={"postId": 1},
        )
        assert response.status_code == 401

    @patch("app.ai.services.qa_bot.generate_community_answer")
    def test_community_answer_success(
        self, mock_qa, client: TestClient, auth_headers: dict
    ):
        mock_qa.return_value = CommunityAnswerResponse(
            answer="철근 적재 시 바닥에 받침목을 사용하여 직접 접촉을 피하세요.",
            modelUsed="gpt-5-nano",
        )

        response = client.post(
            f"{API_V1_STR}/ai/community-answer",
            json={"postId": 1},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert "철근" in data["answer"]
        assert data["modelUsed"] == "gpt-5-nano"


# ===== SUMMARIZE DISCUSSION =====


class TestSummarizeDiscussion:
    """POST /api/v1/ai/summarize-discussion"""

    def test_summarize_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/summarize-discussion",
            json={"postId": 1},
        )
        assert response.status_code == 401

    @patch("app.ai.services.qa_bot.summarize_discussion")
    def test_summarize_discussion_success(
        self, mock_summary, client: TestClient, auth_headers: dict
    ):
        mock_summary.return_value = SummarizeResponse(
            summary="H빔 보관 방법에 대한 토론. 습기 차단과 받침목 사용이 핵심.",
            keyPoints=["습기 차단 필수", "받침목 사용", "정기 점검 권장"],
        )

        response = client.post(
            f"{API_V1_STR}/ai/summarize-discussion",
            json={"postId": 1},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert "H빔" in data["summary"]
        assert len(data["keyPoints"]) == 3


# ===== TRANSLATION =====


class TestTranslate:
    """POST /api/v1/ai/translate"""

    def test_translate_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={"text": "안녕하세요", "targetLanguage": "en"},
        )
        assert response.status_code == 401

    @patch("app.ai.services.translation.translate_text")
    def test_translate_success(
        self, mock_translate, client: TestClient, auth_headers: dict
    ):
        mock_translate.return_value = TranslateResponse(
            translatedText="Hello",
            sourceLanguage="ko",
            targetLanguage="en",
            modelUsed="gpt-5-nano",
        )

        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={"text": "안녕하세요", "targetLanguage": "en"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["translatedText"] == "Hello"
        assert data["sourceLanguage"] == "ko"
        assert data["targetLanguage"] == "en"
        assert data["modelUsed"] == "gpt-5-nano"

    @patch("app.ai.services.translation.translate_text")
    def test_translate_with_source_language(
        self, mock_translate, client: TestClient, auth_headers: dict
    ):
        mock_translate.return_value = TranslateResponse(
            translatedText="H빔 잉여자재 10개",
            sourceLanguage="en",
            targetLanguage="ko",
            modelUsed="gpt-5-nano",
        )

        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={
                "text": "10 surplus H-beams",
                "sourceLanguage": "en",
                "targetLanguage": "ko",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["targetLanguage"] == "ko"

    @patch("app.ai.services.translation.translate_text")
    def test_translate_service_error_returns_502(
        self, mock_translate, client: TestClient, auth_headers: dict
    ):
        mock_translate.side_effect = Exception("OpenAI API error")

        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={"text": "안녕하세요", "targetLanguage": "en"},
            headers=auth_headers,
        )
        assert response.status_code == 502

    @patch("app.ai.services.translation.translate_text")
    def test_translate_rate_limit_error_returns_429(
        self, mock_translate, client: TestClient, auth_headers: dict
    ):
        error = Exception("Rate limit exceeded (429)")
        error.status_code = 429
        mock_translate.side_effect = error

        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={"text": "안녕하세요", "targetLanguage": "en"},
            headers=auth_headers,
        )
        assert response.status_code == 429
        assert "rate limit" in response.json()["detail"].lower()

    def test_translate_empty_text_returns_422(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={"text": "", "targetLanguage": "en"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_translate_json_content_returns_422(
        self, client: TestClient, auth_headers: dict
    ):
        """LOCATION JSON content 등 구조화된 데이터 번역 시 422 반환"""
        location_json = '{"latitude": 37.5665, "longitude": 126.9780, "address": "서울특별시 중구"}'
        response = client.post(
            f"{API_V1_STR}/ai/translate",
            json={"text": location_json, "targetLanguage": "en"},
            headers=auth_headers,
        )
        assert response.status_code == 422
        assert "JSON" in response.json()["detail"]


# ===== TRANSLATION CACHING =====


class TestTranslateCaching:
    """Translation Redis caching behavior"""

    @patch("app.ai.services.translation._get_sync_redis")
    @patch("app.ai.services.translation.generate_text")
    def test_cached_translation_skips_ai_call(
        self, mock_gen, mock_redis,
    ):
        """동일 텍스트 두 번째 요청 시 AI API 미호출 확인"""
        from app.ai.services.translation import translate_text

        mock_redis_instance = MagicMock()
        mock_redis.return_value = mock_redis_instance

        # 1차: 캐시 미스 -> AI 호출
        mock_redis_instance.get.return_value = None
        mock_gen.return_value = '{"translated_text": "Hello", "detected_language": "ko"}'

        result1 = translate_text("안녕하세요", "auto", "en")
        assert result1.translated_text == "Hello"
        assert mock_gen.call_count == 1

        # 2차: 캐시 히트 -> AI 미호출
        import json
        mock_redis_instance.get.return_value = json.dumps(
            {"translated_text": "Hello", "detected_language": "ko"}
        )

        result2 = translate_text("안녕하세요", "auto", "en")
        assert result2.translated_text == "Hello"
        assert mock_gen.call_count == 1  # 여전히 1회

    @patch("app.ai.services.translation._get_sync_redis")
    @patch("app.ai.services.translation.generate_text")
    def test_translation_works_without_redis(
        self, mock_gen, mock_redis,
    ):
        """Redis 없을 때도 번역 정상 동작 확인"""
        from app.ai.services.translation import translate_text

        mock_redis.return_value = None
        mock_gen.return_value = '{"translated_text": "Hello", "detected_language": "ko"}'

        result = translate_text("안녕하세요", "auto", "en")
        assert result.translated_text == "Hello"
        assert mock_gen.call_count == 1


# ===== SH-41 / SH-42: AI 텍스트 후처리 =====


class TestStripMarkdown:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("**규격:** PVC 50A", "규격: PVC 50A"),
            ("## 상품 설명\n__수량__: 20박스", "상품 설명\n수량: 20박스"),
            ("* 상태 양호\n+ 미개봉", "- 상태 양호\n- 미개봉"),
            ("`KS` [참고](https://x.y)", "KS 참고"),
            ("타일 600*600 규격", "타일 600*600 규격"),  # 규격의 단독 * 유지
        ],
    )
    def test_strip_markdown(self, raw, expected):
        from app.ai.text import strip_markdown

        assert strip_markdown(raw) == expected


class TestKeywordPriority:
    @pytest.mark.parametrize(
        "keyword,expected",
        [
            ("PVC 파이프 50개", ("PVC 파이프", 50, "개")),
            ("포세린 타일 600각 20박스", ("포세린 타일 600각", 20, "박스")),
            ("철근 D13 1,000kg", ("철근 D13", 1000, "kg")),
            ("PVC 파이프 50A", ("PVC 파이프 50A", None, None)),  # 50A는 관경
            ("합판 두께 12mm", ("합판 두께 12mm", None, None)),  # mm는 수량 단위 아님
            ("데크 3m²", ("데크", 3, "m²")),
            (None, ("", None, None)),
        ],
    )
    def test_parse_keyword(self, keyword, expected):
        from app.ai.services.registration import parse_keyword

        assert parse_keyword(keyword) == expected

    @patch("app.ai.services.registration.analyze_image")
    def test_keyword_overrides_ai_title_and_sets_quantity(
        self, mock_vision, client: TestClient, auth_headers: dict
    ):
        """QA 재현: 'PVC 파이프 50개' → AI가 'OA 파이프 50A'로 바꾸던 문제."""
        mock_vision.return_value = {
            "category": "배관",
            "title_suggestion": "OA 파이프 50A",
            "tags": [],
            "confidence": 0.3,
        }

        response = client.post(
            f"{API_V1_STR}/ai/analyze-image",
            json={"imageUrl": "https://example.com/pipe.jpg", "keyword": "PVC 파이프 50개"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["titleSuggestion"] == "PVC 파이프"
        assert data["quantity"] == 50
        assert data["quantityUnit"] == "개"
        assert mock_vision.call_args.kwargs["keyword"] == "PVC 파이프 50개"

    @patch("app.ai.services.registration.analyze_image")
    def test_ai_title_kept_when_it_contains_keyword(self, mock_vision):
        from app.ai.services.registration import analyze_material_image

        mock_vision.return_value = {"title_suggestion": "PVC 파이프 50A 잉여"}
        result = analyze_material_image("https://example.com/p.jpg", "PVC 파이프")
        assert result.title_suggestion == "PVC 파이프 50A 잉여"
        assert result.quantity is None

    @patch("app.ai.services.registration.generate_text")
    def test_description_markdown_stripped_and_quantity_in_prompt(self, mock_llm):
        from app.ai.services.registration import generate_material_description

        mock_llm.return_value = "**규격:** PVC 파이프\n**수량:** 50개"
        result = generate_material_description(
            title="PVC 파이프", quantity=50, quantity_unit="개"
        )
        assert result.description == "규격: PVC 파이프\n수량: 50개"
        assert "수량: 50개" in mock_llm.call_args.kwargs["user_prompt"]


class TestPriceSimilarCount:
    @patch("app.ai.services.registration.generate_text")
    @patch("app.ai.services.search.vector_search_only")
    def test_similar_count_is_actual_matches(self, mock_search, mock_llm):
        from app.ai.services.registration import suggest_material_price

        m = MagicMock(title="PVC 파이프", price=10000)
        mock_search.return_value = [(m, 0.8), (m, 0.7)]
        mock_llm.return_value = '{"suggested_price": 9000, "price_range_low": 8000, "price_range_high": 10000, "reasoning": "**유사 매물** 평균"}'

        result = suggest_material_price(db=MagicMock(), title="PVC 파이프")
        assert result.similar_count == 2
        assert result.reasoning == "유사 매물 평균"

    @patch("app.ai.services.registration.generate_text")
    @patch("app.ai.services.search.vector_search_only", return_value=[])
    def test_similar_count_zero_without_data(self, _mock_search, mock_llm):
        from app.ai.services.registration import suggest_material_price

        mock_llm.return_value = '{"suggested_price": 9000, "price_range_low": 8000, "price_range_high": 10000, "reasoning": "일반 시세"}'
        assert suggest_material_price(db=MagicMock(), title="x").similar_count == 0


class TestCommunityAnswerQuality:
    def test_prompt_forbids_unverified_law_citations(self):
        from app.ai.prompts.chat_qa import COMMUNITY_ANSWER_PROMPT

        assert "반드시 관련 규정" not in COMMUNITY_ANSWER_PROMPT
        assert "조항 번호를 인용하지 않음" in COMMUNITY_ANSWER_PROMPT
        assert "마크다운 금지" in COMMUNITY_ANSWER_PROMPT

    @patch("app.ai.services.qa_bot.generate_text")
    def test_community_answer_markdown_stripped(self, mock_llm):
        from app.ai.services.qa_bot import generate_community_answer

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = MagicMock(
            title="자재 보관", content="습기 관리 방법?", category="자유"
        )
        mock_llm.return_value = "### 답변\n**습기 관리**가 중요합니다."
        assert generate_community_answer(db, 1).answer == "답변\n습기 관리가 중요합니다."
