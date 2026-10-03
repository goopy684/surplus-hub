# Surplus Hub 백오피스(Admin) PRD — CS · 기획 운영자용

> **문서 버전** v1.0 (2026-06-15)
> **상태** Draft (검토 요청)
> **대상 서비스** `surplus-hub-api-v3` (FastAPI + SQLAlchemy + PostgreSQL/pgvector) + Flutter 모바일 앱
> **독자** CS 운영자, 기획/운영(Planning) 운영자, 운영 리드, 백오피스 개발팀, PM
> **근거(SSOT)** 본 PRD의 모든 기능 요구사항은 추측이 아니라 실제 코드의 **데이터 모델 · 상태 전이(state machine) · API · RBAC**에서 역으로 도출되었다. 엔티티/엔드포인트/상태값은 모두 코드에서 검증된 실재 값이다.

---

## 0. TL;DR (한 장 요약)

- **Surplus Hub = 건설 현장 잉여 자재 B2B 마켓플레이스**(당근마켓류). 자재 등록/검색 → 채팅 협의 → 거래 → 리뷰(매너온도) → 커뮤니티.
- **결정적 사실: 플랫폼 안에 실제 결제·정산·에스크로가 없다.** 대금은 채팅으로 협의해 **오프라인**으로 오간다. 유일한 직접 매출원인 프리미엄 구독(IAP)조차 영수증 검증이 **스텁(stub)** 상태다.
  - → CS의 "환불"은 인앱 환불이 아니라 **거래 강제취소(`CANCELLED`) + 매물상태 복구(`RESERVED→ACTIVE`)**로 재정의된다. 분쟁 처리의 본질은 **신뢰·안전(Trust & Safety)**이다.
- **이미 어드민 인프라 일부가 존재**한다(신고 처리, 금칙어, 사용자 제재, RBAC 역할관리, CSV export, 대시보드). 하지만 **실제 운영자의 업무 흐름(job-to-be-done)** 단위로는 큰 갭이 있다.
- **본 PRD는 "백지 신규"가 아니라 "기존 기능 정합화 + 결정적 갭 보완"** 이다. 재사용 가능한 것은 재사용하고, 없는 것만 신설한다(각 모듈에 명시).
- **선결 토대(Phase 0)**: ① 관리자 행위 **감사로그 전면화**, ② **RBAC 정합화**(`is_superuser`↔`admin_role` 이원화 해소), ③ 관리자 **인증 강화**, ④ 통계 **사전집계·period 버그 수정**. 이 4가지 없이는 어떤 운영 기능도 안전·신뢰 기반 위에 못 선다.

---

## 1. 문서 목적과 범위

### 1.1 목적
CS·기획 운영자가 Surplus Hub를 **개발자 개입 없이, 안전하게(감사 가능하게), 효율적으로** 운영할 수 있는 백오피스 제품의 요구사항을 정의한다.

### 1.2 범위 (In-scope)
- CS 운영: 신고/모더레이션, 사용자/제재, 거래 분쟁, 콘텐츠 takedown, 채팅 증거 열람, 구독 문의 응대, 처리결과 통지, 감사 추적
- 기획 운영: 성장 대시보드, 카테고리/택소노미, 추천 매물 큐레이션, 이벤트/프로모션, 공지·푸시 캠페인, 구독·요금제 현황, 검색·AI 튜닝, 데이터 export
- 공통 플랫폼: RBAC 재설계, 감사로그, 운영자발 알림 인프라, 통계 사전집계

### 1.3 범위 외 (Out-of-scope)
- 실제 PG/IAP 결제 연동 자체의 구현(별도 결제 트랙). 단, **결제검증 스텁은 구독 백오피스의 선결 의존성**으로 명시한다(§9.5).
- 모바일 앱(Flutter) 클라이언트 기능 변경. 단, 백오피스 조치가 앱 노출에 미치는 영향은 수용기준으로 검증한다.
- 데이터 웨어하우스/BI 외부 도구 구축(초기에는 백오피스 내장 대시보드 + CSV export로 대체).

### 1.4 용어 정의 (도메인 사전)
| 용어 | 의미 |
|---|---|
| **Material(자재)** | 거래 대상 건설 잉여자재 매물. 상태머신 `ACTIVE/REVIEWING/RESERVED/SOLD/HIDDEN` |
| **Transaction(거래)** | 특정 자재에 대한 거래 레코드. `PENDING→CONFIRMED→COMPLETED` 또는 `CANCELLED`. **실제 결제와 무관한 의사·상태 추적용** |
| **매너온도(manner_temperature)** | 당근식 신뢰지표. 받은 리뷰 평균을 `(avg-1)/4*80+10`(약 10~90) 매핑 |
| **trust_level** | 사용자 신뢰 등급(기본 1) |
| **Report(신고)** | `target_type`(user/material/post/comment) × `reason`(spam/abuse/fraud/inappropriate/other). 상태 `pending→reviewed/resolved/dismissed` |
| **UserSanction(제재)** | `WARNING/SUSPENSION/BAN`. `is_active` + `expires_at`(null=영구) |
| **admin_role** | 관리자 RBAC. `MODERATOR(1) < ADMIN(2) < SUPER_ADMIN(3)`, null=일반유저 |
| **is_superuser** | `admin_role`과 **별개**의 레거시 슈퍼유저 불리언(SQLAdmin GUI·자재심사 게이트) |
| **하이브리드 검색** | 키워드 0.3 + 벡터 0.7 가중합, `MIN_SIMILARITY 0.3`, pgvector HNSW |
| **takedown** | 운영자가 콘텐츠를 숨김/삭제하는 강제 조치 |

---

## 2. 제품 배경 — "왜 지금 백오피스인가"

Surplus Hub는 폐기될 건설 자재를 재유통해 비용 절감·환경 보호를 달성하는 마켓플레이스다. C2C/B2B 거래·채팅·커뮤니티가 모두 **사용자 생성 콘텐츠(UGC)** 위에서 돌아가므로, 서비스가 커질수록 **사기·욕설·스팸·허위매물·평점조작** 같은 신뢰·안전 사고가 필연적으로 증가한다.

현재 운영의 위험을 코드 근거로 정리하면:

1. **사고 대응 수단이 빈약하다.** 신고는 받지만(`POST /reports`) 신고 화면에서 대상 원문을 볼 수 없고, 신고→제재가 수동이며, 게시글/댓글/리뷰/채팅을 운영자가 직접 내릴 방법이 없다(작성자 본인만 삭제 가능).
2. **거래가 묶인다.** BAN 시 진행 거래가 `CANCELLED`되지만 선점됐던 매물(`RESERVED`)을 `ACTIVE`로 되돌리는 로직이 없어 **매물이 영구히 묶이는 버그성 갭**이 존재한다.
3. **책임 추적이 안 된다.** 감사로그가 역할변경에만 남아, 누가 누구를 밴/해제/숨김했는지 사후 확인 불가 → 내부통제·분쟁 대응 취약.
4. **데이터를 신뢰할 수 없다.** 구독 검증이 스텁이라 매출 KPI가 허수, 통계 `period=week/month`가 무시되어 주/월 추세가 실제로는 일 데이터.
5. **위험한 raw 편집기에 의존한다.** 운영 변경을 하려면 개발자가 DB를 만지거나 `is_superuser`가 SQLAdmin GUI로 RBAC·검증·감사를 모두 우회한 채 테이블을 직접 편집해야 한다.

> **결론**: 백오피스는 "있으면 좋은 것"이 아니라 **서비스를 합법·안전하게 운영하기 위한 필수 인프라**다.

---

## 3. 현황 분석 (As-Is)

### 3.1 이미 존재하는 어드민 기능 (재사용 자산)
| 영역 | 대표 엔드포인트 | 운영자가 할 수 있는 일 | 성숙도 |
|---|---|---|---|
| 대시보드/통계 | `GET /api/v1/admin/dashboard/summary`, `/stats/{users,materials,transactions}` | KPI 8종 요약 + 일자별 추세(실시간 COUNT) | ⚠️ partial (period 버그) |
| 데이터 내보내기 | `GET /api/v1/admin/dashboard/export/{type}` | 사용자/자재/거래 CSV(기간 필터) | ✅ solid |
| 신고 처리 | `GET/PATCH /admin/moderation/reports`, `GET /queue`, `POST /bulk` | 신고 목록/상태변경/일괄처리 | ✅ solid |
| 금칙어 | `GET/POST/DELETE /admin/moderation/banned-words` | 금칙어 CRUD(soft delete) | ✅ solid (단 enforcement 미연결) |
| 사용자/제재 | `GET /admin/users`, `/{id}`, `POST /{id}/sanctions`, `DELETE …/{sid}`, `POST/GET /{id}/notes` | 검색/상세/제재발동·해제/메모 | ✅ solid (검색 한정적) |
| 관리자 역할 | `GET /admin/roles`, `/audit-logs`, `PUT /{id}/role` | 역할 부여/회수, 감사로그 조회 | ✅ solid |
| 자재 심사 | `PATCH /admin/materials/{id}/review` | 승인(ACTIVE)/반려(HIDDEN) | ⚠️ partial (`is_superuser` 게이트) |
| 신고 접수 | `POST /api/v1/reports` | 사용자 신고 생성 | ✅ solid |
| 전체 사용자 목록 | `GET /api/v1/users/` | raw 목록(superuser) | 🔴 stub |
| SQLAdmin GUI | `/admin/*` | User/Material/ChatRoom/Post raw CRUD | 🔴 위험(RBAC·감사·검증 우회) |

### 3.2 인증 · RBAC 현황
- **RBAC**: `app/core/permissions.py`의 `ROLE_HIERARCHY`(SUPER_ADMIN=3 > ADMIN=2 > MODERATOR=1). 엔드포인트별 `get_current_admin_user(min_role=…)`로 최소권한 강제. **세분화된 scope/action 권한 없음 — 오직 4단계 서열.**
- **이원화된 권한**: 자재 심사·SQLAdmin GUI·`GET /users/`는 `admin_role`이 아닌 **`is_superuser` 불리언**으로 게이트 → 두 체계가 불일치하게 공존.
- **인증**: 관리자도 일반 사용자와 **동일한 Clerk JWT(RS256, 실패 시 로컬 HS256 폴백)** 경로 사용. **관리자 전용 로그인/MFA/IP제한/세션타임아웃 없음**, **JIT auto-signup 동작**, 최초 SUPER_ADMIN 부트스트랩 절차 부재. (SQLAdmin GUI만 이메일+비번 세션 인증 별도.)

### 3.3 핵심 갭 (코드에서 확인된 12종 요약)
1. **감사로그가 역할변경에만 기록** — 제재/신고처리/일괄처리/금칙어/자재심사/export 전부 무기록.
2. **사용자 검색이 이름/이메일 ilike 뿐** — 거래ID/신고ID/clerk_id/전화번호 역추적 불가.
3. **신고 화면에 대상 원문 미조인** — 신고된 자재/글/댓글/유저를 같은 화면에서 못 봄.
4. **모더레이션 큐가 report 단일 소스** — 금칙어 탐지/자재 심사대기/누적신고 미통합.
5. **자재 심사가 `is_superuser` 게이트** — ADMIN/MODERATOR 승인 불가, 심사 대기열 목록 API 없음.
6. **SQLAdmin GUI가 무제한 raw 편집** — 데이터 무결성/내부통제 위험.
7. **MODERATOR 실효권한 빈약** — BAN/제재해제/CSV/일괄처리 불가 → 매건 ADMIN 에스컬레이션.
8. **기능 단위(scope) 권한 부재** — 직무별 최소권한 적용 불가.
9. **기획·CS 필수기능 자체 부재** — 카테고리/이벤트 CRUD, 추천 큐레이션, 공지·푸시 발송, 개별 거래 조회·개입, 구독 백오피스 등.
10. **`period=week/month` 무시** — 주/월 집계가 실제로는 일 데이터.
11. **관리자 인증 강화 부재** — Clerk 공유·auto-signup·MFA 없음 → 권한 탈취 위험.
12. **워크플로 관리 부재** — 신고/제재에 SLA·담당배정·재오픈/이의제기 흐름 없음.

### 3.4 운영 영향 기술부채 (Build 전 인지 필요)
- 통계가 매 요청 전테이블 COUNT(사전집계 `DailyStats` 테이블은 정의만 있고 채우는 잡 없음 = 죽은 코드).
- 구독 `verify_receipt` 스텁 → 매출 KPI 신뢰 불가(선결과제).
- AI 사용량/비용/`search_mode` 미계측, `SearchLog`만 적재.
- 금칙어 `check_banned_words` 헬퍼는 있으나 작성 경로에 **미연결**(등록만 되고 실제 차단 안 됨).
- 알림 enum(`COMMENT/LIKE/MATERIAL_STATUS`) 미구현, 실제 생성되는 알림은 `CHAT`만.
- FCM 실패 토큰 자동 정리 없음, Firebase 미설정 시 푸시가 **조용히 no-op**(장애 은폐).
- 제재 enforcement 갭: `SUSPENSION`이 실제 로그인/행동 차단으로 연결 안 됨, `expires_at` 만료 자동해제 배치 없음.
- 리뷰 어뷰징: 실제 거래 완료 검증 없이 리뷰 가능, `material_id=NULL`이면 동일인 무제한 리뷰 → 매너온도 조작.

---

## 4. 목표 · 성공지표

### 4.1 비즈니스 목표
- **G1. 운영 안전성**: 신뢰·안전 사고를 SLA 내 처리하고 모든 조치를 감사 가능하게 만든다.
- **G2. 운영 자립성**: 카테고리/이벤트/추천/공지 등 운영 변경을 개발자 없이 처리한다.
- **G3. 성장 가시성**: 정확한 성장·인게이지먼트 KPI와 전환 퍼널을 매일 본다.
- **G4. 내부통제**: 최소권한·감사·관리자 인증 강화로 권한 오남용/탈취 위험을 낮춘다.

### 4.2 성공지표 (백오피스 자체의 KPI)
| 지표 | 정의 | 목표(초기) |
|---|---|---|
| 신고 처리 SLA | 접수→종결 평균시간 / 24h 초과 미처리 건수 | 평균 < 12h, 24h초과 0 지향 |
| 감사 커버리지 | 민감조치(제재/취소/takedown/구독변경) 중 audit 기록 비율 | 100% |
| 개발자 개입률 | 운영 변경 중 개발자 DB/SQLAdmin 의존 비율 | → 0% |
| RESERVED 잔류 매물 | 취소 후 ACTIVE 미복구 매물 수 | 0 |
| 대시보드 신뢰도 | period 정확도, 사전집계 적용 | week/month 정확 집계 |
| MODERATOR 에스컬레이션율 | 1선 CS가 ADMIN 승격 없이 처리한 비율 | 상승 추세 |

---

## 5. 페르소나 · 핵심 Job-to-be-done

### 5.1 CS(고객지원) 운영자
- **역할**: 1선 고객문의·분쟁·신고/어뷰징·계정문제·콘텐츠 신고 처리. 기본 등급 **MODERATOR**, 파괴적 조치(BAN/제재해제/강제취소)는 **ADMIN**.
- **핵심 JTBD**: "신고된 콘텐츠의 실제 내용을 한 화면에서 보고, 근거를 모아, 적절한 제재/취소/숨김을 감사 가능하게 즉시 처리한다."
- **대표 Pain**: 대상 원문 미조인 / 다중키 검색 불가 / 신고→제재 수동 / 거래 개입 API 부재 / 콘텐츠 takedown 수단 부재 / 무기록.

### 5.2 기획/운영(Planning) 운영자
- **역할**: 카탈로그 택소노미, 콘텐츠 큐레이션(추천/배너), 이벤트/프로모션, 구독·요금제, 성장 KPI, 검색/AI 튜닝, 공지·푸시 캠페인.
- **핵심 JTBD**: "앱 진열을 신선하게 유지하고(카테고리·추천·이벤트), 정확한 성장 지표를 보며, 캠페인으로 재방문·전환을 끌어올린다 — 개발자 없이."
- **대표 Pain**: 카테고리/이벤트 admin CRUD 부재 / 추천 큐레이션 필드 자체 없음 / period 버그 / 매출 KPI 허수 / 검색 가중치 코드상수 / 운영자발 푸시 불가.

---

## 6. 정보구조 · 권한 모델 (To-Be 공통 토대)

> 이 장은 **Phase 0 선결 토대**다. 개별 기능 모듈(§7, §8)이 모두 여기에 의존한다.

### 6.1 RBAC 재설계 — "역할 서열 + 직무 scope" 하이브리드
**문제**: 현재는 4단계 서열뿐이라 "콘텐츠만 만지는 기획자", "결제 조회만 하는 재무"에 최소권한을 줄 수 없다.

**권고안(결정 필요 §13-D1)**: 기존 역할 서열을 유지하되 **scope(권한 토큰)** 레이어를 추가한다.
- 역할(role)은 기본 scope 묶음을 부여하고, 개별 사용자에게 scope를 가감.
- 예시 scope: `report:review`, `sanction:warn`, `sanction:ban`, `txn:cancel`, `content:takedown`, `chat:read`, `subscription:read`, `subscription:write`, `category:write`, `event:write`, `featured:write`, `campaign:send`, `search:tune`, `audit:read`, `export:read`.
- 엔드포인트는 `require_scope("…")`로 게이트(기존 `get_current_admin_user(min_role)`와 병행/대체).

### 6.2 권한 정합화 (이원화 해소)
- **`is_superuser` 의존 제거**: 자재 심사(`PATCH /admin/materials/{id}/review`)를 `admin_role` 계층(또는 `content:takedown` scope)으로 전환.
- **SQLAdmin GUI**: 운영자에게 **부여 금지**. break-glass(긴급) 슈퍼유저 전용으로만 유지하고 접근 자체를 audit + 알림.
- **`GET /users/`(stub)**: 표준 페이지네이션/응답모델로 정비하거나 `GET /admin/users`로 일원화.

### 6.3 감사로그 전면화 (AdminAuditLog 확장)
- 모든 **쓰기/민감 조치**가 `AdminAuditLog`(admin_id, action, target_type, target_id, details, ip_address, created_at)에 기록되어야 한다.
- 기록 대상(현재 누락): 제재 발동/해제, 신고 단건/일괄 처리, 금칙어 추가/삭제, 자재/콘텐츠 takedown, 거래 강제취소, 구독 강제변경, 카테고리/이벤트/추천/배너 변경, 캠페인 발송, 검색 가중치 변경, **채팅 열람**(통신 민감), CSV export, SQLAdmin 로그인.
- 감사로그는 **읽기 전용**(어떤 운영자도 편집/삭제 불가).

### 6.4 관리자 인증 강화
- 관리자 권한 보유자에 대해 **MFA · IP allowlist · 짧은 세션 타임아웃 · 재인증(step-up)**(BAN/강제취소 등 파괴적 조치 전) 적용.
- 관리자 계정 **JIT auto-signup 차단**, 최초 SUPER_ADMIN **부트스트랩 절차** 정의(시드 스크립트/환경변수).
- 운영 환경에서 Clerk JWKS dev 폴백·`verify_aud:False` 점검.

### 6.5 PII · 통신비밀 접근통제
- `users.email/name/location`, `messages.content`, `materials.location` 등은 **MODERATOR+ & 감사로깅 강제** 하에서만 노출.
- 채팅(`Message`) 열람은 통신비밀에 준해 **명시적 사유 입력 + 감사 + (권고) step-up 인증**.

### 6.6 데이터 정합 모니터링 (느슨한 참조)
- `Material.category`/`Post.category`는 FK가 아닌 문자열 → **고아 데이터 점검 위젯** 필요.
- `likes_count`(denormalized) ↔ 실제 Like 레코드 **불일치 모니터링**.

---

## 7. 기능 요구사항 — CS 모듈

> 포맷: 각 모듈은 **우선순위 / 설명 / 데이터·상태근거 / 주요 액션 / 유저스토리 / 수용기준 / 재사용 vs 신규**.
> 우선순위: **P0**(서비스 안전운영 필수) · **P1**(필요) · **P2**(개선).

### CS-1. 통합 신고/모더레이션 큐 — **P0**
- **설명**: pending 신고를 우선순위·사유·대상유형별로 보여주는 1선 작업 큐. 동일 target 누적신고를 묶고, 각 신고에서 **대상 원문**(매물/글/댓글/유저/채팅)으로 바로 이동·열람.
- **근거 엔티티/상태**: `Report(status: pending→reviewed/resolved/dismissed, target_type, reason)`, 대상 `User/Material/Post/Comment/Message`.
- **주요 액션**: status·target_type·reason 필터/페이지네이션 · 단건 상태변경(reviewed_by/at 기록) · 일괄처리(dismiss/resolve/review) · 대상 원문 미리보기/상세이동 · 누적신고 묶어보기.
- **유저스토리**: CS 운영자로서 신고 콘텐츠의 실제 내용을 같은 화면에서 확인하고 즉시 조치하기 위해, 우선순위가 매겨진 통합 큐에서 대상 원문을 보고 처리하고 싶다.
- **수용기준**:
  1. `status=pending` 필터 시 미처리 신고만 최신순 + total 반환.
  2. 각 행에서 `target_type/target_id`를 해석해 대상의 제목/본문/작성자 미리보기 표시(없으면 "삭제됨/없음").
  3. `resolved` 변경 시 `reviewed_by`/`reviewed_at` 기록, pending 복귀 불가.
  4. 동일 `target_type+target_id` 신고 2건↑이면 누적건수 묶음 표시.
  5. 일괄처리는 현재 pending 건에만 적용, 처리건수(count) 반환.
- **재사용/신규**: 재사용 `GET /admin/moderation/queue|reports`, `PATCH …/{id}`, `POST …/bulk` · **신규**: 대상 원문 조인, 누적 묶기, 큐 소스 확장(금칙어 탐지/자재 심사대기 통합).

### CS-2. 사용자 360도 뷰 (CS 고객 카드) — **P0**
- **설명**: 한 사용자의 프로필(PII)·계정상태·매너온도·신뢰등급·제재이력·관리자메모·신고이력(가해/피해)·거래·구독을 한 화면에 집약.
- **근거**: `User`, `UserSanction`, `AdminNote`, `Report`, `Transaction`, `Subscription`, `Review`.
- **주요 액션**: **다중키 검색**(이름/이메일 부분일치 + user_id/clerk_id/거래ID/신고ID 정확일치) · 제재/메모/신고(양방향)/거래/구독 통합조회 · AdminNote 작성 · is_active·활성제재 즉시 확인.
- **유저스토리**: CS 운영자로서 고객을 빠르게 식별하고 맥락을 파악하기 위해, 여러 키로 검색해 한 화면에서 계정·제재·신고·거래·구독을 모두 보고 싶다.
- **수용기준**:
  1. 이름/이메일 부분일치 외 user_id/clerk_id 정확일치로 검색 가능.
  2. 상세 응답에 sanctions, adminNotes, 가해신고(reporter 기준)·피해신고(target=user 기준), 거래(seller/buyer), 구독(plan/status/expires_at) 포함.
  3. AdminNote 작성 시 admin_id/created_at 기록·즉시 반영.
  4. `is_active=False` 계정은 상단에 정지 배지 + 활성 제재 사유 표시.
  5. PII·채팅 열람은 MODERATOR+ 권한에서만 노출.
- **재사용/신규**: 재사용 `GET /admin/users`, `/{id}`, `/{id}/notes` · **신규**: 다중키 검색, 신고/거래/구독 통합 조인.

### CS-3. 제재 발동·해제 (정지/차단/경고) — **P0**
- **설명**: 신고 또는 직접 판단으로 `WARNING/SUSPENSION/BAN` 발동·해제. **BAN 부가효과**(대상 is_active=False + 진행거래 일괄 CANCELLED)를 명확히 노출. 신고↔제재 연결 추적, 제재 행위 감사.
- **근거/상태머신**: `UserSanction(sanction_type, is_active, expires_at)`, `User.is_active`, `Transaction(PENDING/CONFIRMED→CANCELLED)`, `Report`, `AdminAuditLog`.
- **주요 액션**: 제재 생성(type/expires_at/사유) · 해제(다른 활성 BAN 없으면 재활성화) · 근거 Report 연결 · 감사기록.
- **유저스토리**: CS 운영자로서 어뷰징 사용자를 제재하고 부당정지를 풀어주기 위해, 신고와 연결된 제재를 발동·해제하고 이력을 감사 가능하게 남기고 싶다.
- **수용기준**:
  1. WARNING/SUSPENSION은 MODERATOR+, BAN은 ADMIN+ (MODERATOR가 BAN 시 403).
  2. BAN 시 `user.is_active=False` + 해당 유저가 seller/buyer인 PENDING·CONFIRMED 거래 전부 CANCELLED.
  3. BAN 해제 시 **다른 활성 BAN 0건일 때만** 재활성화.
  4. 발동/해제 시 AdminAuditLog에 admin_id/action/target/사유/IP/시각 기록.
  5. 근거 report_id 연결 시 360뷰에서 신고→제재 연결 표시.
- **⚠️ 결함 연계**: BAN의 거래 CANCELLED 시 **선점 매물 RESERVED→ACTIVE 복구 누락**(현재 갭) → CS-4와 함께 해결.
- **재사용/신규**: 재사용 `POST/DELETE /admin/users/{id}/sanctions…` · **신규**: 신고-제재 연결 FK, 제재 감사로깅.

### CS-4. 거래 분쟁/환불 처리 (거래 조회·강제취소) — **P0**
- **설명**: 결제·에스크로가 없으므로 CS의 "환불"은 **거래 강제취소 + 매물상태 복구**다. 현재 거래는 통계·CSV 외 **개별 조회/개입 엔드포인트가 전무**.
- **근거/상태머신**: `Transaction(PENDING/CONFIRMED/COMPLETED/CANCELLED)`, `Material(RESERVED→ACTIVE)`, `User`.
- **주요 액션**: 거래 단건/목록 조회(당사자·금액·status·created/confirmed/completed 타임라인) · 강제 CANCELLED · **선점 매물 RESERVED→ACTIVE 복구** · user_id/material_id/status 필터 · 감사기록.
- **유저스토리**: CS 운영자로서 거래 분쟁과 환불 문의를 처리하고 묶인 매물을 풀어주기 위해, 개별 거래를 조회·강제취소하며 매물 상태를 정상 복구하고 싶다.
- **수용기준**:
  1. 단건 조회 시 seller/buyer·price·status·타임스탬프 반환.
  2. 강제취소 시 `status=CANCELLED` + 연결 Material이 RESERVED였으면 ACTIVE 복구.
  3. 이미 COMPLETED 거래는 강제취소 거부(409).
  4. user_id/material_id로 거래 목록 필터.
  5. 강제취소는 ADMIN+ & AdminAuditLog 기록.
- **재사용/신규**: **신규**(BAN 부가효과의 거래취소 로직 `crud_moderation` 참고 + RESERVED→ACTIVE 복구 포함).

### CS-5. 콘텐츠 takedown (매물/글/댓글/리뷰 숨김·삭제) — **P0**
- **설명**: 신고된 부적절 콘텐츠를 작성자 계정 제재 없이 직접 내린다. 매물은 HIDDEN 가능하나 `is_superuser` 게이트, 글/댓글/리뷰는 작성자 본인만 삭제 가능(운영자 수단 부재).
- **근거**: `Material(status=HIDDEN, reviewed_by/note/at)`, `Post`, `Comment`, `Review(+매너온도 재계산)`, `Message`.
- **주요 액션**: 매물 HIDDEN/복원(review_note) · 글/댓글 숨김(blind)·삭제 · 악성 리뷰 삭제+매너온도 재계산 · 감사기록.
- **유저스토리**: CS 운영자로서 2차 피해를 막기 위해, 작성자 제재 없이도 해당 콘텐츠를 직접 숨기거나 삭제하고 싶다.
- **수용기준**:
  1. 매물 숨김 시 HIDDEN + reviewed_by/note/at 기록, **admin_role 계층 게이트(`is_superuser` 의존 제거)**.
  2. 글/댓글 숨김 시 공개 목록·상세 비노출, **감사용 원문 보존**(신규 status 상태값 필요).
  3. 악성 리뷰 삭제 시 대상 매너온도 재계산.
  4. takedown은 MODERATOR+ & AdminAuditLog 기록.
  5. 이미 숨김/삭제된 콘텐츠 중복 takedown은 멱등 처리.
- **재사용/신규**: 재사용 `PATCH /admin/materials/{id}/review`(게이트 전환) · **신규**: 글/댓글/리뷰/메시지 운영자 takedown + Post/Comment에 status(숨김) 상태값 추가.

### CS-6. 채팅/메시지 증거 열람 (분쟁 조사) — **P1**
- **설명**: 사기·협박·욕설 신고 조사 시 ChatRoom/Message 열람. **통신비밀 민감** → 접근통제·감사 필수.
- **근거**: `ChatRoom`, `Message(message_type: TEXT/IMAGE/LOCATION)`, `User`, `Material`.
- **수용기준**:
  1. material_id 또는 buyer/seller user_id로 ChatRoom 검색.
  2. 메시지 created_at 오름차순 + 타입별 렌더링.
  3. MODERATOR+ 권한에서만 열람.
  4. 열람 시 AdminAuditLog에 admin_id/room_id/시각/IP 기록.
  5. 신고 상세(target=chat/message)에서 해당 대화로 이동 링크.
- **재사용/신규**: **신규**(현재 참여자 본인용 조회만 존재).

### CS-7. 구독/IAP 문의 응대 (구독 조회) — **P1**
- **설명**: 결제·구독 문의 응대용 조회. `verify_receipt` 스텁으로 데이터 신뢰도 낮음 → 경고 표기 + 강제만료 제공.
- **근거**: `Subscription(plan/status/expires_at/iap_receipt_id)`, `User`.
- **수용기준**:
  1. plan/status/started_at/expires_at/iap_receipt_id 조회.
  2. 강제 취소/만료 시 status 변경 + isPremium 즉시 false.
  3. 강제변경은 ADMIN+ (매출 민감).
  4. 변경 시 AdminAuditLog 기록.
  5. 화면에 "영수증 서버검증 미적용" 경고 표시.
- **재사용/신규**: **신규**(본인용 `GET /users/me/subscription`은 부적합).

### CS-8. CS 처리결과 통지 (운영자발 알림) — **P2**
- **설명**: 신고자·제재대상에게 처리결과를 통지. 현재 알림은 사실상 CHAT만 생성됨.
- **근거**: `Notification(reference_type/id)`, `User`, `Report`, `UserSanction`.
- **수용기준**: 신고 종결 시 신고자 알림 / 제재 시 대상에 사유·기간 알림 / 원 신고·제재와 reference 연결 / MODERATOR+ / 표준 템플릿(금칙어·PII 미노출).
- **재사용/신규**: **신규**(Notification 모델 존재, CS 트리거 부재).

### CS-9. CS 감사 로그 조회 — **P1**
- **설명**: CS 조치(제재·신고처리·takedown·거래취소·구독변경) 추적 읽기전용 화면.
- **근거**: `AdminAuditLog`, `User`.
- **수용기준**: admin_id/action/target/기간 필터+페이지네이션 / 각 액션이 고유 action 값 / admin_id·target·details·ip·created_at 포함 / **편집·삭제 불가** / ADMIN+ 조회.
- **재사용/신규**: 재사용 `GET /admin/roles/audit-logs` · **신규**: CS 액션 기록 확장(§6.3).

### CS 권한 매트릭스 (요약)
| 조치 | 최소권한(권고) |
|---|---|
| 신고 큐 조회·단건 상태변경 | MODERATOR+ |
| 신고 일괄처리 | ADMIN+ (1선 효율 위해 MODERATOR 검토) |
| 사용자 조회·PII·AdminNote | MODERATOR+ |
| WARNING/SUSPENSION | MODERATOR+ |
| BAN / 제재해제·재활성화 | ADMIN+ (부당정지 해제는 MODERATOR 검토) |
| 거래 강제취소·매물복구 | ADMIN+ |
| 콘텐츠 takedown | MODERATOR+ |
| 채팅 증거 열람 | MODERATOR+ (감사 강제) |
| 구독 조회 / 강제만료 | MODERATOR+ / ADMIN+ |
| 감사로그 조회 | ADMIN+ |

---

## 8. 기능 요구사항 — 기획/운영 모듈

### PL-1. 성장·인게이지먼트 대시보드 — **P0**
- **설명**: 기획 운영자 홈. KPI 요약 + 일/주/월 추세 + 전환 퍼널(탐색→찜→채팅→거래완료) + 검색 품질. **`period=week/month` 실집계 버그 수정** + 인게이지먼트/검색 위젯 추가.
- **근거**: `User/Material/Transaction/Report/MaterialLike/ChatRoom/SearchLog/DailyStats`.
- **수용기준**:
  1. MODERATOR+ 로 summary 호출 시 KPI 8종 실집계 반환.
  2. `period=week|month` 요청 시 주/월 그룹핑(현재처럼 일 단위 무시 금지).
  3. 검색 위젯: 인기 검색어 Top N + results_count=0 비율.
  4. 임베딩 커버리지 위젯: `embedding_vector NOT NULL` 비율(목표 95%) 백분율.
  5. 추세는 DailyStats 있으면 사전집계, 없으면 실시간 폴백.
- **재사용/신규**: 재사용 dashboard 라우터 · **신규**: period 버그 수정 + 퍼널/검색/임베딩 위젯 + DailyStats 집계잡.

### PL-2. 카테고리·택소노미 관리 — **P0**
- **설명**: 자재 분류 마스터를 직접 CRUD. 현재 공개 `GET /categories/`만 존재(쓰기 경로 전무). `Material.category` 느슨참조 고아 점검 포함.
- **근거**: `Category(name 고유, icon, display_order, is_active)`, `Material`.
- **수용기준**:
  1. ADMIN+ 생성, 중복 name 409.
  2. display_order 변경 시 공개 정렬 반영.
  3. is_active=false 시 공개 GET에서 제외, 관리자 목록엔 잔존.
  4. 카테고리명 변경 시 참조 Material 건수·고아 가능성 경고.
  5. 생성/수정/비활성화 AdminAuditLog 기록.
- **재사용/신규**: 재사용 모델/`crud_category` · **신규**: admin CRUD 엔드포인트 + 고아 점검.

### PL-3. 추천 매물 큐레이션 — **P0**
- **설명**: 홈/탐색 상단 노출 매물 지정. **Material에 큐레이션 필드(`is_featured`/`featured_rank`/`featured_until`)가 없어 컬럼 추가가 선행**되는 net-new.
- **근거**: `Material(status=ACTIVE 가드)`, `MaterialImage`, `Category`, `User`.
- **수용기준**:
  1. ACTIVE 아닌 매물 추천 지정 시 409.
  2. 추천 목록 API에 featured_rank 오름차순 노출.
  3. featured_until 경과 시 자동 제외.
  4. 추천 매물이 SOLD/HIDDEN 전환 시 목록에서 자동 사라짐.
  5. 지정/해제 AdminAuditLog 기록.
- **재사용/신규**: **신규**(Material 큐레이션 컬럼 추가 + 추천 목록/관리 엔드포인트).

### PL-4. 이벤트·프로모션 관리 — **P0**
- **설명**: 이벤트/프로모션/공지 배너 CRUD. 현재 공개 조회만 존재. is_active + start/end_date 노출제어, 배너는 S3 업로드 재사용.
- **근거**: `Event(event_type: general/promotion/notice, is_active, start/end_date)`.
- **수용기준**:
  1. ADMIN+ 생성 시 공개 GET에 is_active=true·기간 내일 때만 노출.
  2. 미래 start_date는 예정 상태로 관리자 목록에만.
  3. end_date 경과 시 공개 목록 자동 제외.
  4. is_active=false 시 즉시 공개 비노출.
  5. 생성/수정/중단 AdminAuditLog 기록.
- **재사용/신규**: 재사용 모델/`crud_event`/`/upload/image` · **신규**: admin CRUD.

### PL-5. 공지·푸시 캠페인 — **P1**
- **설명**: 전체/세그먼트 대상 인앱 공지(Notification)+FCM 푸시 발송·예약. 현재 운영자 발송 경로 부재. `push.py`+`create_notification` 재사용.
- **근거**: `Notification`, `DeviceToken`, `User`, `Subscription`.
- **수용기준**:
  1. **Firebase 미설정 시 no-op로 조용히 묻히지 않고 "푸시 비활성" 명시 반환**.
  2. 발송 시 인앱 Notification 동시 생성.
  3. 예약 발송은 지정시각 1회만, 중복 없음.
  4. 전송 성공/실패 토큰 수 + 읽음 수 집계 반환.
  5. 발송 본문 `check_banned_words` 사전검사.
  6. 캠페인 발송 AdminAuditLog 기록.
- **재사용/신규**: 재사용 FCM/`crud_notification`/DeviceToken · **신규**: 세그먼트·예약·집계·발송 엔드포인트 + 실패토큰 정리.

### PL-6. 구독·요금제 관리 — **P1**
- **설명**: 구독자 현황·매출(MRR/ARPU)·전환 KPI. **`verify_receipt` 스텁 → 신뢰도 경고 표기**, 실 IAP 검증 연동 전제.
- **근거**: `Subscription`, `User`.
- **수용기준**:
  1. ADMIN+ 로 plan/status 필터 조회.
  2. 만료 임박 정렬.
  3. plan별 사용자 수 + active/expired/cancelled 분포 집계.
  4. 스텁 기간 동안 매출 KPI에 "검증 미연동·신뢰 불가" 경고.
  5. 구독 조회는 PII·매출 민감 → AdminAuditLog 기록.
- **재사용/신규**: 재사용 모델/`crud_subscription` · **신규**: 백오피스 조회/집계. **선결 의존성: §9.5 IAP 실검증.**

### PL-7. 검색·AI 튜닝 콘솔 — **P1**
- **설명**: 하이브리드 검색 모니터링·튜닝. `KEYWORD_WEIGHT(0.3)/VECTOR_WEIGHT(0.7)/MIN_SIMILARITY(0.3)`가 코드상수라 재배포 없이는 조정 불가, `search_mode` 미적재 → 런타임 설정화 + 메트릭 적재 + 임베딩 백필 트리거 필요.
- **근거**: `SearchLog`, `Material(embedding_vector)`.
- **수용기준**:
  1. results_count=0 검색어 Top N + 비율.
  2. `search_mode`(hybrid vs keyword_only)가 DB/메트릭에 적재되어 폴백 비율 집계.
  3. 가중치 변경이 런타임 설정으로 **재배포 없이** 검색에 반영.
  4. 임베딩 커버리지 < 95%면 backfill 트리거 버튼 활성.
  5. 가중치 변경은 ADMIN+ & old/new AdminAuditLog 기록.
- **재사용/신규**: 재사용 `GET /ai-assist/search`/SearchLog · **신규**: 런타임 설정(AppConfig) + 메트릭 적재 + 백필 트리거.

### PL-8. 데이터 내보내기 (CSV Export) — **P2**
- **설명**: 사용자/자재/거래 CSV(기간 필터). **이미 solid** — 재사용만. 구독/검색 export 확장 여지.
- **수용기준**: ADMIN+ 스트리밍 다운로드 / startDate·endDate 필터 / 미허용 type 400 / (확장 시) subscriptions export는 PII·매출 민감 → 감사기록.
- **재사용/신규**: 재사용 `GET /admin/dashboard/export/{type}`.

### 기획 권한 매트릭스 (요약)
| 조치 | 최소권한(권고) |
|---|---|
| 대시보드·통계·검색 메트릭 조회 | MODERATOR+ |
| 카테고리·이벤트·추천·배너 CRUD | ADMIN+ (`content:write`) |
| 공지·푸시 캠페인 발송/예약 | ADMIN+ (`campaign:send`) |
| 구독·매출 KPI·구독자 PII | ADMIN+ (`billing:read`) |
| CSV export | ADMIN+ (`export:read`) |
| 검색 가중치·임베딩 백필 | ADMIN+ (`search:tune`) |

---

## 9. 공통/플랫폼 요구사항 (선결·횡단)

- **§9.1 감사로그 인프라**: §6.3 전면화. 모든 모듈의 수용기준에 "AdminAuditLog 기록"이 포함됨.
- **§9.2 운영자발 알림 인프라**: `create_notification`을 CS-8/PL-5가 공유. 알림 enum(`COMMENT/LIKE/MATERIAL_STATUS`) 미구현분 정리, 표준 템플릿.
- **§9.3 통계 사전집계**: `DailyStats` 채우는 배치/잡 신설(현재 죽은 코드) + `period` 정확 집계. 대시보드 부하 완화.
- **§9.4 검색/AI 메트릭 적재**: `search_mode`·AI 호출량/실패율/비용 계측 레이어(현재 로그 grep 의존).
- **§9.5 결제/IAP 실검증 (선결과제·별도 트랙)**: `verify_receipt` 스텁 → Apple App Store Server API / Google Play Developer API 실검증 + 만료/취소/환불 웹훅 + `expires_at` 만료 배치. **이 전까지 구독·매출 KPI는 신뢰 불가로 표기**하며 PL-6은 "조회+경고" 범위로 운영.
- **§9.6 금칙어 enforcement 연결**: `check_banned_words`를 글/댓글/채팅/캠페인 작성 경로에 연결(현재 미연결).
- **§9.7 제재 enforcement·만료 자동화**: `SUSPENSION` 실제 행동차단 미들웨어 + `expires_at` 경과 시 `is_active` 자동해제 배치.

---

## 10. 데이터 모델 영향 (신규/변경)

| 변경 | 대상 | 사유 | 관련 모듈 |
|---|---|---|---|
| 컬럼 추가 `is_featured`/`featured_rank`/`featured_until` | `materials` | 추천 큐레이션 필드 부재 | PL-3 |
| 상태값 추가 `status`(visible/hidden/deleted) | `posts`, `comments` | 운영자 takedown·원문 보존(현재 물리삭제만) | CS-5 |
| 연결 추가 `report_id`(FK) 또는 사유링크 | `user_sanctions` | 신고→제재 추적 | CS-3 |
| 액션 표준화·기록 확장 | `admin_audit_logs` | 전 조치 감사(현재 역할변경만) | 전 모듈 |
| 신규 테이블/설정 `app_config`(또는 KV) | 신규 | 검색 가중치 런타임화 | PL-7 |
| 적재 시작 | `daily_stats` | 사전집계(죽은 코드 활성화) | PL-1 |
| 적재 필드 `search_mode` | `search_logs` 또는 메트릭 | 폴백 비율 집계 | PL-1/PL-7 |
| 권한 모델 `scope` 레이어 | 신규(역할-scope 매핑) | 직무별 최소권한 | §6.1 |
| 신규 테이블 `push_campaigns` | 신규 | 캠페인 예약/집계 이력 | PL-5 |

> 모든 스키마 변경은 Alembic 마이그레이션으로 관리(레포에 `alembic/versions/` 존재). 인덱스: 다중키 검색(CS-2)을 위해 `users.clerk_id`, `transactions.id`, 신고/거래 필터 컬럼 인덱스 점검.

---

## 11. 비기능 요구사항 (NFR)

- **보안/내부통제**: 관리자 MFA·IP·세션·step-up(§6.4), SQLAdmin 운영자 차단(§6.2), PII/통신비밀 접근통제(§6.5), 이미지 URL SSRF·LLM 프롬프트 인젝션 방어(기술부채), 키 Secrets Manager 이관.
- **감사성**: 민감조치 100% 감사, 감사로그 불변(읽기전용), 보존기간 정책.
- **성능**: 대시보드 사전집계(§9.3)로 P95 응답 안정, 큐/목록 페이지네이션 필수.
- **신뢰성**: 푸시 no-op 은폐 제거(명시 반환), 실패토큰 정리, Redis 의존(분산 rate limit/캐시).
- **국제화/표기**: UI 한국어 기본. 브랜드 표기는 `Alan` 규칙과 무관(본 서비스는 Surplus Hub). 통지 템플릿 다국어 여지.
- **접근성**: 운영 효율을 위한 키보드 단축·대량처리(일괄) 지원.
- **관측성**: AI/검색/푸시 메트릭(§9.4), 운영자 행위 텔레메트리.

---

## 12. 릴리스 로드맵 (우선순위·의존성)

> 원칙: **토대 먼저, 그 위에 CS(안전) → 기획(성장) → 고도화.** 각 Phase는 직전 Phase의 감사·권한 토대에 의존.

### Phase 0 — 플랫폼 토대 (선결, 약 2~3주)
- §6.3 감사로그 전면화 · §6.2 RBAC 정합화(자재심사 게이트 전환, is_superuser 정리) · §6.4 관리자 인증 강화 · §9.3 통계 period 수정/DailyStats 잡.
- **DoD**: 모든 후속 쓰기 액션이 감사에 남고, 운영자 권한이 `admin_role`로 일원화된다.

### Phase 1 — CS 안전운영 P0 (약 3~4주)
- CS-1 통합 신고큐(+대상원문) · CS-2 사용자 360뷰(+다중키) · CS-3 제재(+신고연결·감사) · CS-4 거래 강제취소(+매물복구) · CS-5 콘텐츠 takedown.
- **의존**: Phase 0. **DoD**: 신고→근거확인→제재/취소/숨김→통지/감사 end-to-end 가능, RESERVED 잔류 0.

### Phase 2 — 기획 성장 P0 (약 3~4주)
- PL-1 성장 대시보드(+퍼널/검색위젯) · PL-2 카테고리 admin · PL-3 추천 큐레이션(컬럼추가) · PL-4 이벤트/프로모션 admin.
- **DoD**: 개발자 개입 없이 진열·카테고리·이벤트 운영, 정확한 주/월 KPI.

### Phase 3 — P1/P2 고도화 + 결제 트랙
- CS-6 채팅 증거열람 · CS-7 구독 조회 · CS-8 통지 · CS-9 감사조회 · PL-5 푸시 캠페인 · PL-6 구독·요금제 · PL-7 검색·AI 튜닝 · PL-8 export 확장.
- **병렬 트랙**: §9.5 IAP 실검증(PL-6 신뢰성의 선결).

---

## 13. 미해결 결정사항 (의사결정 요청)

> 아래는 PM/운영 리드의 결정이 필요한 항목이다. **각 항목에 권고안을 제시했고, 별도 지시가 없으면 권고안대로 진행한다.**

- **D1. RBAC 모델**: (권고) 역할 서열 유지 + **scope 레이어 추가**(하이브리드). 대안: 4단계 유지하고 MODERATOR 권한만 확대 / 완전 scope 기반 전환.
- **D2. 백오피스 프런트엔드**: (권고) **전용 React 백오피스 신설** + admin REST API 확장, SQLAdmin은 break-glass 전용으로 격리. 대안: 당장은 SQLAdmin 강화(비권장 — 감사/검증 우회 위험).
- **D3. MODERATOR 권한 범위**: (권고) 1선 효율을 위해 **신고 일괄처리·부당정지 해제**를 MODERATOR에 부여(현재 ADMIN 전용). 대안: 현행 유지.
- **D4. 구독 백오피스 시점**: (권고) **PL-6은 "조회+경고+강제만료"로 먼저** 출시, MRR/ARPU 등 매출 KPI는 §9.5 IAP 실검증 완료 후 활성화.
- **D5. 채팅 열람 통제 수준**: (권고) MODERATOR+ & 감사 & **사유입력 + step-up 인증**(통신비밀 민감도 반영). 대안: ADMIN+ 로 상향.
- **D6. SUSPENSION enforcement**: (권고) Phase 0~1 중 **실제 행동차단 미들웨어 + 만료 자동해제 배치** 포함(현재 상태플래그만 존재).

---

## 14. 리스크 · 가정

**가정**
- 본 분석 시점(2026-06-15) 코드 기준. 매물 거래는 free 마켓(오프라인 결제), 구독만 직접 매출.
- 백오피스는 기존 FastAPI REST를 확장해 별도 운영자 웹에서 소비한다.

**리스크**
- **R1. 결제 무결성**: `verify_receipt` 스텁이 모든 영수증을 premium 처리 → 매출 사기/허수. (완화: §9.5 선결, KPI 경고)
- **R2. 데이터 우회 편집**: SQLAdmin GUI raw 편집이 감사/검증을 우회. (완화: §6.2 격리)
- **R3. 권한 탈취**: 관리자 인증이 일반 사용자와 동일·MFA 없음. (완화: §6.4)
- **R4. 거래 묶임 버그**: BAN/취소 시 매물 RESERVED 잔류. (완화: CS-4 복구 로직)
- **R5. 통계 오해**: period 버그·실시간 COUNT 부하. (완화: §9.3)
- **R6. 어뷰징**: 리뷰/매너온도 조작, 금칙어 미적용, 중복신고. (완화: §9.6, 리뷰 거래검증, 누적신고 묶기)
- **R7. 푸시 장애 은폐**: Firebase 미설정 no-op. (완화: 명시 반환 + 도달률 지표)

---

## 부록 A. 핵심 상태머신

**Material.status**
```
REVIEWING ──승인──▶ ACTIVE ──거래생성──▶ RESERVED ──완료──▶ SOLD
   │                  ▲  │                  │
 반려                 복원 │ 숨김             강제취소(복구)
   ▼                  │  ▼                  ▼
 HIDDEN ◀─────takedown─┘  HIDDEN          ACTIVE
```
**Transaction.status**: `PENDING ─confirm→ CONFIRMED ─complete→ COMPLETED` / 임의단계 `→ CANCELLED`(관리자·BAN 경로). 완료 시 Material→SOLD, 취소 시 Material RESERVED→ACTIVE(신규 복구).

**Report.status**: `pending → reviewed / resolved / dismissed` (되돌리기 불가).

**UserSanction**: `WARNING | SUSPENSION(expires_at) | BAN(영구=null)` × `is_active`. BAN→ user.is_active=False + 진행거래 CANCELLED.

## 부록 B. 모듈 ↔ 데이터 엔티티 매핑
| 모듈 | 핵심 엔티티 |
|---|---|
| CS-1 | Report, User/Material/Post/Comment/Message |
| CS-2 | User, UserSanction, AdminNote, Report, Transaction, Subscription, Review |
| CS-3 | UserSanction, User, Transaction, Report, AdminAuditLog |
| CS-4 | Transaction, Material, User |
| CS-5 | Material, Post, Comment, Review, Message |
| CS-6 | ChatRoom, Message, User, Material |
| CS-7 | Subscription, User |
| CS-8 | Notification, User, Report, UserSanction |
| CS-9 | AdminAuditLog, User |
| PL-1 | User, Material, Transaction, Report, MaterialLike, ChatRoom, SearchLog, DailyStats |
| PL-2 | Category, Material |
| PL-3 | Material, MaterialImage, Category, User |
| PL-4 | Event |
| PL-5 | Notification, DeviceToken, User, Subscription |
| PL-6 | Subscription, User |
| PL-7 | SearchLog, Material |
| PL-8 | User, Material, Transaction |

## 부록 C. 기존 어드민 엔드포인트 인벤토리 (재사용 기준)
```
GET   /api/v1/admin/dashboard/summary
GET   /api/v1/admin/dashboard/stats/{users|materials|transactions}
GET   /api/v1/admin/dashboard/export/{users|materials|transactions}
GET   /api/v1/admin/moderation/reports
PATCH /api/v1/admin/moderation/reports/{report_id}
GET   /api/v1/admin/moderation/queue
POST  /api/v1/admin/moderation/bulk
GET   /api/v1/admin/moderation/banned-words
POST  /api/v1/admin/moderation/banned-words
DELETE/api/v1/admin/moderation/banned-words/{word_id}
GET   /api/v1/admin/users
GET   /api/v1/admin/users/{user_id}
POST  /api/v1/admin/users/{user_id}/sanctions
DELETE/api/v1/admin/users/{user_id}/sanctions/{sanction_id}
POST  /api/v1/admin/users/{user_id}/notes
GET   /api/v1/admin/users/{user_id}/notes
GET   /api/v1/admin/roles
GET   /api/v1/admin/roles/audit-logs
GET   /api/v1/admin/roles/{user_id}
PUT   /api/v1/admin/roles/{user_id}/role
PATCH /api/v1/admin/materials/{material_id}/review   # is_superuser → admin_role 전환 필요
POST  /api/v1/reports                                 # 사용자 신고 접수
```

---
*본 PRD는 `surplus-hub-api-v3` 코드 분석에 근거해 작성되었으며, 모든 엔티티·상태·엔드포인트는 실재 코드에서 검증되었다. 변경 시 코드 SSOT와 함께 갱신할 것.*
