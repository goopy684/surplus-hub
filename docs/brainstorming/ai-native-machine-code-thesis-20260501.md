# Design (DRAFT — 진행 중)

> **세션 재개용 스냅샷.** /office-hours 진행 중 저장. 다음 세션에서 이 파일 보여주면 Phase 4(대안 framing) → Phase 5(최종 design doc) → Phase 6(handoff) 이어서 진행 가능.

- **생성일:** 2026-05-01
- **세션 모드:** Builder / 학습·사고실험
- **Status:** Phase 3 완료, Phase 3.5 진행 중(Codex second opinion 대기)
- **남은 단계:** Phase 4 대안 generation → Phase 5 design doc 본문 → Spec review loop → Closing

---

## 0. 원본 발상 (사용자 한국어, 그대로 보존)

> 생각을 해보니 좋은 아이디어가 떠올랐는데, 에이아이가 다 구현하고 코딩하잖아. 이제 굳이 사람이 그 언어를 이해하지 않아도 될 것 같다는 거지. 그럼, 뭘 할 수 있다? 최적화를 위해 할 수 있고, 시간 복잡도와 공간 복잡도를 최적화할 수 있는 방법에 대한 아이디어가 떠올랐어요. 왜 그러냐면, 프로그래밍 언어 같은 경우가 사람이 이해하기 쉽도록 만든 게 고급 언어거든. 그리고 컴파일된 언어, 인터프리트 언어, 그리고 C, 자바, 파이썬 등등 이런 것들은 사람들이 이해하기 쉽게 만들어진 고급 언어야. 그렇게 하는 이유가 사람이 구현하니까 그런 건데, 이제는 기계가, AI가 다 구현하잖아? 코덱스든, 클로드든, 재미나이든? 그렇다면 원점으로 돌아가자는 거지. 예를 들면, 어셈블리어나 기계어. 특히나 이제 기계어 수준으로 들어가면, 자원을 최대한 활용할 수 있을 거야. 빌드 시간이 없어지는 거지. 기기가 이해할 수 있는 수준의 언어를 바로바로 작성하면, 바로바로 실시간으로 결과물이 생성될 것입니다. 그리고 메모리 공간이나 CPU, 자연 CPU와 메모리 사용하는 효율이 최적화될 것 같아. 그러면 빠르고 적은 리소스의 전기를 사용하게 될 거고, 그러면 요즘 기후 위기에 처해 있는 전 세계적인 이슈에서 효율적으로 기여를 할 수 있을 것 같다. 인간은 빠르고 효율적인 결과물을 얻게 되고, 기계는 자기가 이해할 수 있는 것을 실시간으로 서로 소통할 수 있습니다. 그렇다면 불필요하게 에너지를 사용하는 시간도 줄어들게 되고, 사용하는 자원들도 줄어들게 되는 거지. 그러면 에너지 위기에서 기후 위기에 기여할 수 있을 것 같아. 사람한테도 좋고, 빠르고 최적화된 결과물이 나오니까 기계한테도 좋고, AI한테도 좋은 거지. 굳이 번역할 필요 없고, 자기만 이해하면 되는 거니까. 그리고 전 지구적으로 그러다 보니 배포되는 사용되는 리소스, 예를 들어서 도커 컨테이너 같은 경우도 최적화될 것 같고, 연산하는 시간도 최적화될 것 같으며, 사용되는 기기의 CPU나 메모리 같은 자원도 적겠으니, 전기를 덜 쓰게 되고, 에너지 위기에도 도움이 될 것 같고. 도움 되는 게 너무 많은 것 같아. 이 아이디어를 날카롭게 다듬고, 정리하며, 확장시키도록 도와줘.

---

## 1. 아이디어 분해 (4개의 다른 주장이 한 코트)

원문은 사실 4개의 구분되는 주장이 섞여 있음. 각각 진위 수준, 반박, 선행 연구가 다름.

| # | 주장 | 진위 | 비고 |
|---|------|------|------|
| 1 | AI가 어셈블리/기계어 직접 생성하면 자원을 더 잘 쓴다 | **부분만 사실** | 좁은 영역에서 검증됨 (AlphaDev 등) |
| 2 | 컴파일/빌드 단계가 사라진다 | **이미 부분적으로 실현** | JIT/WASM이 빌드 시간 거의 0 |
| 3 | AI끼리 인간 못 읽는 포맷으로 직접 소통 | **미답 영역** | "기계어"보다는 "바이너리 프로토콜" 주제 |
| 4 | 결과적으로 전기/에너지/기후 기여 | **반박 강함** | Jevons paradox + LLM 추론 비용 |

---

## 2. D1~D6 결정 트리 (지금까지 사용자 선택)

| # | 질문 | 선택 |
|---|------|------|
| **D1** | 이 아이디어로 뭘 하고 싶나? | 학습/사고실험 (빌더 모드 가장 부드러운 변종) |
| **D2** | 4갈래 중 핵심 thread? | **A) 효율/최적화** |
| **D3** | "기계어 수준" 정확한 레벨? | **A) Raw 바이너리 (x86/ARM 옵코드)** — 가장 극단 |
| **D4** | 웹에서 랜드스케이프 검색 OK? | **A) 검색 진행** |
| **D5** | 글의 spine을 어디 둘 것? | **A) AI-primary-author 시대의 컴파일러 스택 재설계** |
| **D6** | 외부(Codex) second opinion? | **A) 받기로 결정** (실행 중 세션 종료로 미완료) |

---

## 3. Phase 2.75 — 랜드스케이프 발견

### Layer 1 (모두가 아는 것)
컴파일러는 포터빌리티를 위해 존재. LLVM/GCC -O3는 매우 똑똑함. 어셈블리 손코딩은 현대 옵티마이저에 자주 짐. JIT/V8/WASM은 빌드 시간 거의 0.

### Layer 2 (현재 담론) — **사용자 발상은 이미 활발히 탐구·구현 중**

| 작업 | 출처 | 핵심 |
|------|------|------|
| AlphaDev (DeepMind, 2023) | [Nature](https://www.nature.com/articles/s41586-023-06004-9) | RL로 어셈블리 정렬 발견. 5-element sort 46→42 명령어, 6.91ns→2.01ns(70% 빠름). **LLVM 표준 라이브러리에 통합되어 Google에서 매일 수조 번 실행** |
| STOKE (Stanford, 2013) | [GitHub](https://github.com/StanfordPL/stoke) | x86-64 stochastic superoptimizer. MCMC로 program space 탐색. GCC -O3급 또는 더 나은 시퀀스 발견 |
| SuperCoder (2025년 5월) | [arXiv 2505.11480](https://arxiv.org/pdf/2505.11480) | PPO-trained 모델, 어셈블리 최적화에서 **1.10× → 1.47× speedup** |
| Souper (2017) | LLVM | LLVM IR superoptimizer, peephole rule 자동 발견 |
| "The Return of Assembly: When LLMs No Longer Need High-Level Languages" | [DEV.to (2025)](https://dev.to/ionionascu/the-return-of-assembly-when-llms-no-longer-need-high-level-languages-1dak) | **사용자의 영문판 thesis가 그대로 작년에 발표됨** |
| "Can your AI rewrite your code in assembly?" | [Daniel Lemire 블로그 (2026-04)](https://lemire.me/blog/2026/04/05/can-your-ai-rewrite-your-code-in-assembly/) | "LLVM은 매우 똑똑하지만 LLM이 도달할 새 plateau가 있다" |
| "LLMs are compilers" | [Vivek Haldar](https://vivekhaldar.com/articles/llms-are-compilers/) | 인접 thesis |
| 표준 반박 | [Kumamemo](https://kumagi.com/blog/en/posts/does-ai-emit-machine-code) | "어셈블리는 LLM 토큰 비용 큼 + 비결정성 + 비포터블 = 나쁜 fit" |

### Layer 3 — Eureka

표준 반박("포터빌리티 + 비결정성 = 나쁜 fit")은 **1990년대 ahead-of-time distribution 모델을 암묵 전제**한다. 즉 "바이너리는 한 번 빌드되어 모든 디바이스로 배포됨".

사용자 원문 — *"바로바로 실시간으로 결과물이 생성될 것"* — 은 다른 모델을 시사한다: **install/first-launch 시점에 사용자 디바이스에서 codegen.** 이 모델에서는 포터빌리티 반박 무력화, 비결정성도 무력화 (AlphaDev가 이미 property-based testing으로 결과 동등성 보증 시연).

JIT가 이미 비슷한가? **부분만 그렇다.** JIT은 deterministic peephole/hot-loop opt만 함. AI는 AlphaDev처럼 **새 시퀀스 자체를 발견** 가능. 디바이스의 실제 캐시/분기예측기/메모리 계층 학습한 모델이 그 디바이스 전용 바이너리 생성하는 그림은 JIT보다 한 층 위.

→ `~/.gstack/analytics/eureka.jsonl` 로그됨.

---

## 4. Phase 3 — 도전 받는 5개 전제 (P1~P5)

사용자의 원문이 암묵적으로 참이라고 가정한 것 중 랜드스케이프와 충돌:

### P1. "고급 언어는 사람을 위한 거라 AI에게 불필요"
**반박:** 어셈블리/머신코드는 LLM에게 **토큰 비용이 매우 큼** (registers, addresses 같은 무기물 문자열). 고급 언어가 사람과 AI 둘 다에게 효율적인 추상화일 가능성. 이걸 정면 답해야 함.

### P2. "AI가 어셈블리로 가면 LLVM보다 잘한다"
**부분만 사실:** AlphaDev/SuperCoder는 **좁은 영역**(작은 정렬, 특정 inner loop)에서만 이김. 일반 코드에서는 LLVM -O3이 거의 최적. 주장은 "전 영역에서 이김"이 아니라 "옵티마이저가 못 찾는 구간을 AI가 찾을 수 있다"로 좁혀야 함.

### P3. "빌드 시간이 사라진다"
**회계 다시:** 빌드 시간은 JIT/WASM에서 이미 거의 0. 진짜 비용은 **LLM 추론 시간으로 이동**. 70B 모델이 1MB 코드를 디바이스에서 다시 생성하는 GPU 시간 vs 한 번 컴파일된 바이너리 재실행 — 전자가 훨씬 비쌈. "캐시하면 되지" → 그건 사실상 AOT 컴파일러.

### P4. "기후/에너지에 도움된다"
**다층 반박:**
- **Jevons paradox:** 효율↑ → 사용량↑ → 총 에너지 같거나 증가 (역사적 사례 풍부)
- **LLM 추론 자체 에너지 비용 큼:** GPT 한 번 호출 = 수십 와트시
- 진짜 절약하려면 codegen 1회 + 캐시 = AOT 컴파일러와 동일

### P5 (블랭크). 포터빌리티 답이 없음
사용자가 raw 바이너리를 골랐는데 포터빌리티 명시적 답을 안 함. 글이 살아남으려면 명시 필요. **가장 강한 답: 디바이스 사이드 codegen** (이걸 채우면 P1-P3도 부분적으로 답 가능).

---

## 5. 글의 Spine (D5 결과)

**선택: A) AI-primary-author 시대의 컴파일러 스택 재설계**

핵심 thesis 한 줄:
> *"AI가 'code를 쓸 수 있느냐'는 끝난 질문이다. 진짜 열린 질문은 — code 작성 주체가 인간에서 AI로 이동했을 때, 컴파일러 스택의 위치/형태/책임이 어떻게 재배치되어야 하는가."*

이 spine이 P1~P5를 처리하는 방식:
- P1 (토큰 비용) → "AI는 raw asm을 직접 안 쓴다, IR을 거친다 — 그러나 IR의 형태와 위치가 바뀐다"로 답
- P3 (빌드 비용) → "codegen 빈도/위치를 재배치하는 것이 핵심 디자인 변수"로 답
- P5 (포터빌리티) → "디바이스 사이드 codegen이 자연스럽게 도출"로 답
- P4 (에너지) → "AI 추론 에너지 vs AOT 절약 에너지의 trade-off"라는 생산적 질문으로 변환

대안 framings (사용자가 D5에서 거부한 것들):
- B) 디바이스 사이드 codegen — 새 distribution model (가장 구체적)
- C) 에너지 효율 — AI 네이티브 그린 컴퓨팅 (가장 시의성)
- D) "고급 언어의 종말" 슬로건 (이미 DEV.to에 있음)

---

## 6. 다음 세션에서 이어서 할 일

### Phase 3.5 (미완료)
- Codex second opinion이 세션 종료로 인해 미완료. 재시작 시 다시 dispatch 가능. 또는 건너뛰고 Phase 4로 진행.
- prompt 파일은 `/tmp/gstack-codex-oh-*` (휘발성 — 사라졌을 가능성, 재작성 필요).

### Phase 4 — 2~3 distinct framings 생성 (필수)
spine A 안에서 글의 구체 형태를 결정:
- **Approach 1 (minimal viable):** 1500자 짧은 에세이. 5개 전제 도전을 단순 나열 + 디바이스 codegen 비전 한 단락. 1주 안에 완성 가능.
- **Approach 2 (ideal):** 4000-6000자 본격 에세이 + 시각화. AlphaDev/STOKE/SuperCoder 차트, "코드 작성 주체-위치-책임" 매트릭스, 2030년 컴파일러 스택 그림.
- **Approach 3 (lateral):** 코드/데모. 작은 함수에 대해 LLM이 직접 ARM64/x86 어셈블리 생성 → LLVM -O3 vs AI 벤치마크 → 결과를 인터랙티브 페이지로. "사고실험"을 "실험"으로 격상.

### Phase 5 — 최종 design doc
`~/.gstack/projects/goopy-priv-surplus-hub/jeongseongchae-main-design-{datetime}.md`로 정식 출력. 이 파일을 reference로 사용 가능.

### Phase 6 — Handoff
- 다음 스킬 추천: `/plan-ceo-review` (확장 모드) 또는 `/plan-eng-review` (실행 락인).
- "What I noticed" 섹션 — 사용자의 사고 패턴 관찰 메모.

---

## 7. 메모: 사용자의 사고 패턴 (관찰)

(다음 세션에서 보강될 예정 — 지금까지 관찰)

- **첫 원리 사고를 자연스럽게 함.** "원점으로 돌아가자" — 이미 있는 컴파일러 스택을 자명하게 받아들이지 않고 그 존재 이유를 묻는 태도.
- **시스템 사고가 자연스러움.** 한 변수의 변화(AI가 primary author)가 인접 시스템(컴파일러, 배포, 에너지)에 어떻게 도미노로 영향을 주는지 본능적으로 추적함.
- **가장 약한 옵션을 자발적으로 깨물었다.** D3에서 "Raw 바이너리"를 고른 건 안전한 선택이 아님 — 포터빌리티 문제를 정면으로 받아들이겠다는 의지. 안전한 길보다 강한 thesis를 선호하는 패턴.
- **글로벌 스케일 임팩트로 자연스럽게 확장.** 개인 효율 → 기후 위기로 사고가 점프하는 빈도가 높음. 이 경향은 거짓 약속(Jevons)으로도 빠질 수 있는 양날의 검.

---

## 8. 재개 명령

다음 세션에서:

```
/office-hours 이어서 — docs/brainstorming/ai-native-machine-code-thesis-20260501.md 부터 Phase 4 시작
```

또는 더 명시적으로:

```
이 파일 읽고 Phase 4 (대안 generation)부터 시작해줘.
spine은 A (AI-primary-author 컴파일러 스택 재설계)로 결정됐고,
3개의 framing 후보(짧은 에세이 / 본격 에세이 + 시각화 / 코드 데모)를 발전시켜서 하나 골라야 함.
```

---

*세션 ID: 10518-1777160950 / 브랜치: main / 사용자: jeongseongchae*
