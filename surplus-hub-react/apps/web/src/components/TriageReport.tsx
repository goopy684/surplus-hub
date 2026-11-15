import { TRIAGE_PATH_LABELS, TriageDiagnosis } from "@repo/core";

const won = (value: number) => Math.abs(value).toLocaleString();

// 결과 화면과 공유 리포트가 함께 쓰는 1장 요약 감정 리포트 (표시 전용)
export function TriageReport({ diagnosis }: { diagnosis: TriageDiagnosis }) {
  const {
    title,
    category,
    materialLabel,
    conditionGrade,
    quantity,
    quantityUnit,
    weightKg,
    weightEstimated,
    liquidityScore,
    scoreDelta,
    matchProbability7d,
    expectedDays,
    dispositionPath,
    comparison,
  } = diagnosis;
  const score = Math.min(100, Math.max(0, liquidityScore));
  const pathLabel = diagnosis.pathLabel || TRIAGE_PATH_LABELS[dispositionPath];
  const hasGrade = conditionGrade === "상" || conditionGrade === "중" || conditionGrade === "하";

  return (
    <article className="flex flex-col gap-4">
      {/* 헤더 — 제목 + 품목·소재·등급·물량 칩 (데이터 있을 때만) */}
      <header>
        <h2 className="text-[22px] font-extrabold leading-[1.3] tracking-[-0.6px] text-foreground">{title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {category ? (
            <span className="rounded-chip border border-line bg-surface px-2.5 py-0.5 text-[12px] font-bold text-muted-foreground">
              {category}
            </span>
          ) : null}
          {materialLabel ? (
            <span className="rounded-chip border border-line bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-foreground">
              {materialLabel}
            </span>
          ) : null}
          {hasGrade ? (
            <span
              className={
                "rounded-chip border px-2.5 py-0.5 text-[12px] font-bold " +
                (conditionGrade === "상"
                  ? "border-olive-bd bg-olive-bg text-olive-tx"
                  : "border-line bg-surface text-muted-foreground")
              }
            >
              상태 {conditionGrade}
            </span>
          ) : null}
          {quantity && quantity > 0 ? (
            <span className="tabular rounded-chip border border-line bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-foreground">
              {quantity}
              {quantityUnit ? ` ${quantityUnit}` : ""}
            </span>
          ) : null}
          {weightKg && weightKg > 0 && !weightEstimated ? (
            <span className="tabular rounded-chip border border-line bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-foreground">
              {weightKg.toLocaleString()}kg
            </span>
          ) : null}
        </div>
      </header>

      {/* 유동성 점수 — 단색 게이지 */}
      <section className="rounded-card bg-field p-4">
        <p className="text-[13px] font-semibold text-muted-foreground">유동성 점수</p>
        <p className="mt-1 text-foreground">
          <span className="num text-[40px] font-bold leading-none">{liquidityScore}</span>
          <span className="ml-0.5 text-[15px] font-semibold">점</span>
        </p>
        <div
          role="meter"
          aria-label="유동성 점수"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-2.5 w-full overflow-hidden rounded-chip bg-line-2"
        >
          <div className="h-full bg-primary" style={{ width: `${score}%` }} />
        </div>
        <ul className="mt-3 space-y-1 text-[13.5px] text-foreground">
          <li>
            7일 내 매칭 확률 <span className="tabular font-bold">{matchProbability7d}%</span> (추정)
          </li>
          {dispositionPath === "A" && expectedDays > 0 ? (
            <li>
              예상 소진 약 <span className="tabular font-bold">{expectedDays}</span>일
            </li>
          ) : null}
          {dispositionPath === "B" ? <li>48시간 매입 호가 접수</li> : null}
          {dispositionPath === "C" ? <li>즉시 일괄 처분 권장</li> : null}
          {scoreDelta !== 0 ? (
            <li className={scoreDelta > 0 ? "text-olive-tx" : "text-destructive"}>
              최초 진단 대비{" "}
              <span className="tabular font-bold">
                {scoreDelta > 0 ? "+" : "−"}
                {Math.abs(scoreDelta)}점
              </span>
            </li>
          ) : null}
        </ul>
      </section>

      {/* 추천 처분 경로 */}
      <section className="rounded-card border border-line p-4">
        <p className="text-[13px] font-semibold text-muted-foreground">추천 처분 경로</p>
        <p className="mt-1 text-[17px] font-extrabold tracking-[-0.3px] text-foreground">
          Path {dispositionPath} · {pathLabel}
        </p>
        {diagnosis.pathReason ? (
          <p className="mt-1 text-sm leading-[1.6] text-muted-foreground">{diagnosis.pathReason}</p>
        ) : null}
      </section>

      {/* 폐기손실 비교 — 세 번째(자투리 판매) 카드가 주인공 */}
      <section aria-labelledby="triage-compare-title">
        <h3 id="triage-compare-title" className="mb-2 text-sm font-bold text-foreground">
          처분 방법별 손익 비교
        </h3>
        {/* 폐기·고철은 나란히, 직거래는 아래 한 줄 전체 — 3열로 쪼개면 금액이 줄바꿈된다 */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-card bg-field p-4">
            <p className="text-[13px] font-semibold text-muted-foreground">혼합폐기물로 버리면</p>
            <p className="mt-1 text-destructive">
              <span className="num text-[20px] font-bold">−{won(comparison.mixedWaste)}</span>
              <span className="text-[13px] font-semibold">원</span>
            </p>
          </div>
          <div className="rounded-card bg-field p-4">
            <p className="text-[13px] font-semibold text-muted-foreground">고철로 넘기면</p>
            <p className="mt-1 text-foreground">
              <span className="num text-[20px] font-bold">+{won(comparison.scrap)}</span>
              <span className="text-[13px] font-semibold">원</span>
            </p>
          </div>
          <div className="col-span-2 rounded-card border border-olive-bd bg-olive-bg p-4">
            <p className="text-[13px] font-semibold text-olive-tx">자투리로 팔면</p>
            <p className="mt-1 text-foreground">
              <span className="num text-[17px] font-bold">+{won(comparison.directSale)}</span>
              <span className="text-[13px] font-semibold">원 입금</span>
            </p>
            <p className="mt-1 whitespace-nowrap text-olive-tx">
              <span className="text-[13px] font-bold">실질 </span>
              <span className="num text-[24px] font-bold">+{won(comparison.netBenefit)}</span>
              <span className="text-[13px] font-bold">원 이득</span>
            </p>
            <p className="mt-0.5 text-[12px] text-olive-tx">폐기비 회피 포함</p>
          </div>
        </div>
      </section>

      {/* 추정 근거 — 사실인 항목만 */}
      <ul className="list-disc space-y-1 pl-4 text-[12px] leading-[1.55] text-muted-foreground">
        {diagnosis.coldStart ? <li>주변 거래 데이터가 아직 적어 품목 기본값으로 추정했습니다.</li> : null}
        {weightEstimated ? <li>중량 미입력 — 100kg 기준으로 계산했습니다.</li> : null}
        {comparison.priceBasis === "similar_listings" ? (
          <li>유사 매물 {comparison.similarPriceCount}건의 중앙값 기준입니다.</li>
        ) : (
          <li>유사 매물이 부족해 품목 평균가로 추정했습니다.</li>
        )}
        <li>폐기·고철 단가는 기준 단가표에 따른 추정치입니다.</li>
      </ul>
    </article>
  );
}
