import { readFileSync } from "fs";
import path from "path";
import { apiClient, analyzeImage, fetchMaterialById, stripMarkdown, suggestPrice } from "@repo/core";

// 백엔드 pytest(test_ai_assist.py)와 같은 케이스 표 — 두 구현이 같은 결과를 내야 한다
const cases = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../../../../surplus-hub-api-v3/app/tests/fixtures/ai_text_cases.json"),
    "utf8"
  )
) as { strip_markdown: [string, string][] };

describe("stripMarkdown (backend strip_markdown parity)", () => {
  it.each(cases.strip_markdown)("%j", (raw, expected) => {
    expect(stripMarkdown(raw)).toBe(expected);
  });
});

// SH-41/42: AI가 만든 텍스트가 화면에 그대로 새는 문제와 근거 없는 시세 건수 회귀 방지
describe("AI text cleanup", () => {
  const get = jest.spyOn(apiClient, "get");
  const post = jest.spyOn(apiClient, "post");

  afterEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("keeps the original description for editing (display strips it separately)", async () => {
    const raw = "**규격:** 600*600\n문의 sales__kr@example.com";
    get.mockResolvedValue({ data: { status: "success", data: { id: 1, title: "타일", description: raw } } });
    const item = await fetchMaterialById("1");
    expect(item?.description).toBe(raw);
    expect(stripMarkdown(item?.description ?? "")).toBe("규격: 600*600\n문의 sales__kr@example.com");
  });

  it("uses the real similar-listing count (0 when none)", async () => {
    post.mockResolvedValue({
      data: { status: "success", data: { suggestedPrice: 9000, priceRangeLow: 8000, priceRangeHigh: 10000, similarCount: 0 } },
    });
    const result = await suggestPrice("PVC 파이프", "설비", undefined, { quantity: 50 });
    expect(result.marketPrice.similarCount).toBe(0);
    expect(post.mock.calls[0]?.[1]).toMatchObject({ quantity: 50 });
  });

  it("passes keyword and reads keyword quantity from image analysis", async () => {
    post.mockResolvedValue({
      data: { status: "success", data: { titleSuggestion: "PVC 파이프", quantity: 50, quantityUnit: "개" } },
    });
    const result = await analyzeImage("data:image/png;base64,AA", "PVC 파이프 50개");
    expect(post.mock.calls[0]?.[1]).toMatchObject({ keyword: "PVC 파이프 50개" });
    expect(result).toMatchObject({ title: "PVC 파이프", quantity: 50, quantityUnit: "개" });
  });
});
