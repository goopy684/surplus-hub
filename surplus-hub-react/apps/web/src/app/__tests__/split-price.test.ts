import { calcSplitPrice } from "@repo/core";

// 백엔드 crud_transaction.split_price와 같은 값이어야 상세 화면 금액과 실제 거래 금액이 일치한다.
describe("calcSplitPrice (backend split_price parity)", () => {
  it.each([
    [50000, 10, 3, 15000],
    [100, 3, 2, 67],
    [5, 2, 1, 3], // 2.5 → 3 (반올림 half-up)
    [1, 10, 1, 1], // 최소 1원
    [0, 10, 3, 0], // 무료나눔은 0원
    [50000, 10, 10, 50000], // 전체 구매 = 원가
    // price*q가 2^53을 넘는 큰 값: 부동소수점 Math.round는 1원 어긋났던 입력
    [2147483647, 4194307, 2438265, 1248390786],
    [1000000001, 2000000001, 2000000000, 1000000000],
  ])("price %d, total %d, quantity %d → %d", (price, total, quantity, expected) => {
    expect(calcSplitPrice(price, total, quantity)).toBe(expected);
  });
});
