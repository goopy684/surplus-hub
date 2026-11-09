import { apiClient, analyzeImage, fetchMaterialById, suggestPrice } from "@repo/core";

// SH-41/42: AI가 만든 텍스트가 화면에 그대로 새는 문제와 근거 없는 시세 건수 회귀 방지
describe("AI text cleanup", () => {
  const get = jest.spyOn(apiClient, "get");
  const post = jest.spyOn(apiClient, "post");

  afterEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("strips markdown from stored material descriptions", async () => {
    get.mockResolvedValue({
      data: { status: "success", data: { id: 1, title: "타일", description: "**규격:** 600*600\n## 상태\n* 미개봉" } },
    });
    const item = await fetchMaterialById("1");
    expect(item?.description).toBe("규격: 600*600\n상태\n- 미개봉");
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
