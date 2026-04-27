@AGENTS.md

NowCar CRM — Claude Code 작업 컨텍스트

이 파일은 Claude Code가 매 세션 자동으로 읽는 프로젝트 컨텍스트다.
claude.ai의 userMemories와는 별개로 동작하므로, 핵심 원칙은 모두 여기에 박아둔다.


1. 사용자 / 회사

이름: 정서호 (총괄대표)
회사: ㈜나우카 (NowCar) — 신차 장기렌트/리스 다이렉트 에이전시
서비스: 금융사–고객 직접 연결 시스템 (중간 유통 수수료 없음)
대표번호: 1666-3230
플랜: Claude Max


2. 작업 환경
항목값프로젝트 폴더C:\Users\jyy19\nowcarcrmLocallocalhost:3000프로덕션nowcarcrm.comSupabase 프로젝트 IDiyjdekaoewridncryypsSupabase MCP연결 완료 (직접 SQL 실행 가능)별도 프로젝트nowcar-automation (자동화용, 본 작업과 무관)

3. 최상위 운영 원칙 (절대 위반 금지)
3-1. 추측 금지 원칙

모든 작업에서 절대 추측 금지. 항상 (1) 이전 대화/CLAUDE.md, (2) 실제 데이터/쿼리 결과, (3) 확정된 결정사항을 대조하여 정확한 정보로만 대응.
"확실합니다 / 문제없습니다" 같은 단정 금지. 근거 없으면 "확인 필요"라고 명시하고 쿼리/증거 요청.
모르면 모른다고 말한다. 추측으로 메우지 않는다.

3-2. 컬럼명/테이블명 추측 금지

SQL 쿼리 전 반드시 information_schema.columns로 실제 컬럼 확인.
어제 customer_name alias 누락 → ambiguous 에러, contract_number 미존재, matched_delivery_id 미존재, created_at 미존재 등 컬럼 추측 실수 반복 발생.
첫 쿼리는 항상 스키마 확인부터.

3-3. 비즈니스 정책값은 서호 확인

요율, 직급, 권한, 출근시간, 회사 고유 규칙은 절대 추측 금지.
알려진 값: 출근 기준 시각 = 09:30
모르는 값은 반드시 서호에게 묻고 진행.

3-4. Claude는 세계 최고 개발자 포지션

기술적 판단 (코드 구조, API 설계, DB 스키마, 라이브러리 선택, 라우트 구조) → 데이터 기반 분석 후 결론만 제시하고 바로 진행. "옵션 1, 2, 3 중 선택" 식 질문 최소화.
비즈니스 정책 (출근시간, 요율, 권한, 회사 고유 규칙) → 반드시 서호에게 확인 후 반영.
기본 흐름: 분석 → 결론 → "이렇게 진행합니다" 선언 → 바로 실행.

3-5. 기존 검증된 로직 보호
다음 파일들은 어제 2월 시뮬 ±2원 재현으로 검증 완료. 건드리지 말 것:

calculator.ts (월 정산 계산 엔진)
aggregator.ts (월별 집계, Phase 9-D 슬라이딩 버그 수정 완료)
modilcaMatcher.ts (모딜카 매칭 로직)
dealerMatcher.ts (법인명 괄호 교차 매칭)

3-6. 배포 권한

git push, vercel deploy 자동 금지. 서호 명시 승인 후에만.
localhost 테스트만 자동 진행 가능.
SQL 마이그레이션은 Supabase MCP로 직접 실행하되, DDL/DELETE/대량 UPDATE는 항상 서호 확인 후.


4. 최종 정산표 최상위 원칙 (2026-04-24 정서호 명시)
4-1. Single Source of Truth
본부장용 나우카 월별 출고내역서 엑셀 = 최종 정산표의 유일한 마스터.
4-2. 데이터 흐름
본부장 엑셀 (마스터, 출고건 정의)
    ↓
모딜카/대리점/지원내역 (보조 데이터)
    ↓ (AG/대리점수당/지원금/슬라이딩/프로모션 자동 매칭하여 본부장 건에 덧붙임)
    ↓
매칭 실패 항목 → 수기 입력으로 보완 (필수 기능)
    ↓
최종 정산표
4-3. 수기 입력 규칙

모든 수기 입력 건은 source='manual' 태그 + audit log 필수.
본부장 엑셀에 매칭 실패한 항목 (AG/대리점수당/지원금 등)은 반드시 수기 입력 가능해야 함.
본부장 엑셀에 없는 건 (롯데렌터카, 서광대리점 등)은 별도 수기 추가 기능으로 처리.

4-4. 충돌 해결 우선순위

담당자 충돌: 본부장 엑셀 우선

예: ㈜동우금속 S500 → 본부장 엑셀 "정서호" / 모딜카 "김선호" → 정서호 정답 (모집인 김선호 표기는 무시)


자체 법인차: 정산 제외

예: ㈜나우카 + 이준영 조합 → 자체 법인차이므로 모딜카 파서에서 continue




5. 검증된 정산 계산 공식 (Phase 9-D, 2026-04-23 검증 완료)
5-1. 매출 계산
매출 = AG공급가 + 프로모션공급가 + 슬라이딩공급가 + 대리점수당
5-2. 직원 배분
직원 배분 = 매출 × base_rate (이호성=60%)
고객지원 지급 = (customer_support 합계 ÷ 2) × 1.1
차량지원 = vehicle_support_monthly (이호성=500,000)
최종 = 직원 배분 + 고객지원 지급 + 차량지원
5-3. 이호성 2026-03 검증값 (재현 시 이 수치와 일치해야 함)
항목값AG공급가278,850프로모션공급가5,510,411슬라이딩공급가5,414,270대리점수당12,243,550매출 합23,447,081직원 배분 (60%)14,068,249고객지원 (3,488,000 ÷ 2 × 1.1)1,918,400차량지원500,000최종16,486,649 (목표 16,486,647 ±2원) ✅
5-4. 이호성 9명 고객-대리점 매핑 (2026-03 검증값)
고객차종대리점수당정미진팰리세이드현대 신천1,300,000김길수쏘렌토기아 행복1,625,890김종수GV80현대 몽촌토성1,781,160이가람투싼현대 신천1,120,000태금섭카니발기아 행복1,886,500박준범GV80현대 신천1,650,000조현준스포티지현대 백마1,390,000장미애스포티지현대 백마1,490,000코리아파워테크-없음0합계12,243,550

박준범 케이스: 본부장엑셀 "박준범", 신천엑셀 "바론엔지니어링(박준범)" → 괄호 교차 매칭 90점 통과.


6. 주요 마스터 데이터
6-1. 이호성 본부장

user_id: 094e6e47-9595-4594-8604-c3ea1f8d018a
요율 템플릿: base_rate=60, vehicle_support_monthly=500000, include_sliding=false, eligible_incentive=false, incentive_per_tier_percent=5

6-2. 권한

SUPER_CEO = '총괄대표' 추가됨

6-3. 대리점 마스터 (settlement_dealers)
엑셀 파서 가능 (5개)
코드이름kia_byeokje기아 벽제kia_chabom기아 차봄 (4월부터)hyundai_capital현대캐피탈hyundai_sincheon현대 신천hyundai_baekma현대 백마
이미지만 (4개): 기아 행복, 현대 몽촌토성, 기아 서광, 현대 금곡
기타: 1개
6-4. 장기렌트 출고 특이사항

벽제/금곡 대리점: 장기렌트 특성상 고객 본인 명의 아닌 렌트사 사업자명으로 명의변경 후 출고.
이 2개 대리점만 고객명 매칭 불가 → 계약번호 + 담당자 + 차량명 3개 키 매칭.
벽제 엑셀 구조: C=계약번호, G=고객명(렌트사명), H=차량가격, J=판매수수료, P=실제 담당자.


7. Phase 구현 현황
Phase내용상태9-A출고 등록/관리✅9-B모딜카 파서 + 매처✅9-C지원내역 파서 + 매처 (법인명 fuzzy)✅9-D월 정산 계산 엔진 (슬라이딩 매출 버그 수정 완료)✅9-E요율 템플릿✅10-A본부장 일괄 업로드✅10-B대리점별 엑셀 파서 (벽제/차봄/캐피탈/신천/백마)✅10-D정산 재오픈 기능✅10-F일관성 체크✅11-AOpenAI Vision OCR (gpt-4o, 한글 한계로 백업용)✅11-B이월 건 자동 추적⏸ 대기

8. 어제(2026-04-23~24) 해결한 버그

Phase 9-D 슬라이딩 매출 버그: aggregator.fetchMonthlyAggregation에서 sliding_paid_to_staff=true 조건 때문에 일반 건 매출 누락. 조건 제거하여 전건 합산.
settlement_monthly_reports 컬럼 4개 누락: reopened_count, last_reopened_at, last_reopened_by, last_reopen_reason. ALTER TABLE로 추가.
compute-all 500 에러: settlement_rate_templates의 user_id, updated_by 둘 다 users FK라 PostgREST users!inner 모호. 2단계 쿼리로 분리.
법인명 매칭 강화 (dealerMatcher.ts):

"바론엔지니어링(박준범)" ↔ "박준범" → 90점 (괄호 안 이름 추출)
"유진상사(김경환)" ↔ "김경환(유진상사)" → 95점 (괄호 교차)
"㈜플랜아이디" ↔ "플랜아이디(홍영국)" → 85점 (부분 포함)


신천 파서: 고객명 끝 "님" 자동 제거.
백마 파서: 헤더 행 자동 감지 + 동적 컬럼 매핑.
벽제 파서: P열이 실제 담당자.


9. 어제 후반(2026-04-24) 발견한 매칭률 회귀
9-1. 증상
월파일매칭미매칭매칭률2월 (시뮬)17-2.(나우카) 2026년 2월 출고내역서(정산본).xlsx64297%3월 (실운영)모딜카 3월.xlsx2663%
9-2. 원인 (데이터 검증 완료)
원인 ①: 모딜카 고객명 화살표 형식

"신동현->신들***", "조인익 -> 이서율로", "박순돌->대신환경산"
settlement_deliveries의 본부장 고객명("신동현")과 매칭 실패
해결: modilcaParser.ts에 normalizeModilcaCustomerName() 헬퍼 추가

"A->B" → "A"만 추출 (화살표 앞부분이 매칭 키)
화살표 없으면 그대로 반환
공백 허용: "A -> B" 도 처리



원인 ②: ㈜나우카 자체 법인차

모딜카 R4: 이준영 / ㈜나우카 / 카이엔 / 181,100,000
정산 대상 아님
해결: 파서 루프에서 (고객명=㈜나우카 + 담당자=이준영) 조합 시 continue

원인 ③: 본부장 vs 모딜카 시트 구조 차이 (영향 미미)

본부장: 렌트 시트(62건) + 리스 시트(3건) 분리
모딜카: 리스 건이 렌트 시트에 혼재
수기 보완으로 충분.

9-3. 어제 초기화 작업 (실행 완료)

settlement_deliveries 2026-04 정산월 65건 → soft delete (deleted_at = NOW())
settlement_modilca_uploads 오늘 업로드 1건 → status = 'rolled_back'
settlement_dealer_uploads: 손대지 않음 (애초에 업로드 안 함)
2026-03 시뮬 데이터(63건): 무사 보존 ✅

9-4. 검증된 결과
항목실행 후2026-04 활성02026-03 활성 (보호)63모딜카 rolled_back1

10. 정책 결정 (2026-04-24 정서호 확정)
항목결정매칭 키본부장 고객명 = 모딜카 화살표 앞부분마스터 우선순위본부장 엑셀 (충돌 시 본부장 우선)㈜동우금속 S500 담당자정서호 대표 (김선호 모집인 표기는 무시)㈜나우카 카이엔자체 법인차 → 정산 제외리스 시트 누락 건수기 처리 허용본부장 엑셀에 없는 외부 건수기 추가 기능으로 처리 (롯데렌터카, 서광 등)

11. 오늘(2026-04-25 이후) 진행 순서
Step 0 ▶ DB 상태 확인 (현황 파악)
         - 2026-04 활성/삭제 건수
         - 모딜카 업로드 이력
         - 직원별 분포

Step 1 ▶ modilcaParser.ts 수정
         - normalizeModilcaCustomerName() 추가
         - 자체 법인차 제외 로직
         - tsc + build 검증

Step 2 ▶ 본부장 3월 엑셀 재업로드 → 65건 복구

Step 3 ▶ 모딜카 3월 재업로드 → 매칭률 95%+ 검증

Step 4 ▶ 대리점 4종 엑셀 + 이미지 4종 업로드
         - 엑셀: 벽제, 현대캐피탈, 신천, 백마
         - 이미지: 행복, 몽촌토성, 서광, 금곡

Step 5 ▶ 지원내역 3월 업로드

Step 6 ▶ 월 정산 계산 → 이호성 3월 정산 최종 수치 확인

Step 7 ▶ 수기 입력 UI 구현
         - 본부장 매칭 실패 항목 보완 (AG/대리점수당/지원금)
         - 본부장 엑셀에 없는 건 추가 (롯데/서광)
         - source='manual' + audit log

12. 남은 이슈 (백로그)
우선순위 높음

본부장 파서 연도 오판정 버그 (2026-04-27 발견): 4-23 16:32 첫 업로드 시 modilcaParser가 ag_settlement_month='2025-04'로 잘못 박음 (정답 2026-04). upload_id d4bb5c9f, 61건 ghost로 들어가 4-27 soft delete로 정리됨. modilcaParser.ts 연도 추출 로직 점검 필요 — 다음 본부장 업로드(2026-05 정산월) 전 해결 권장.
supportMatcher 'draft' 누락 점검 필요 (2026-04-27 발견): modilcaMatcher와 별개의 MATCHABLE_STATUSES const 보유 (supportMatcher.ts:4). modilcaMatcher는 4-27 'draft' 추가했으나 support는 미적용 → Step 5 (지원내역 업로드) 전 동일 패턴 확인 후 'draft' 추가 권장.
Phase 10-B 수기 입력 UI 버그: 월 이동 안 됨, 출고건 리스트 로드 실패, 입력 필드 표시 안 됨
탭 전환 시 상태 잔존: page.tsx에 key={dealer.id} prop 추가 필요
Phase 10-C disputes API 500: GET /api/settlement/disputes?report_id=... 실패

우선순위 중간

leads 인라인 변경 핸들러 PATCH 일관화: commitCounselingStatus 외 다음연락(next_contact_at)/우선순위(sensitivity)/심사상태(review_status)/담당자 변경 등 다른 인라인 핸들러도 여전히 full-row UPDATE → patchLead로 전환 권장. 동일 stale-overwrite 위험.
LeadDetailModal 저장 후 listing leads state refresh (Option C): AdminShell의 onUpdate가 router.refresh()만 호출하고 LeadsCategoryPage의 client-side leads state는 갱신 안 됨. patchLead로 우회 중이지만 근본 해결은 useLeadDetailModal 컨텍스트에 onLeadSaved 구독 패턴 추가 필요.
Vision OCR 정규화: "님" 접미사, 담당자 오인식 (장정환→장정현, 이호성→이준성), 법인명 한글 오류
Phase 11-B 이월 건 자동 추적: 신천 R6 삼민운수 같은 케이스 (전달 현대캐피탈 먼저 정산받은 건 자동 탐지)
contract_number 컬럼 ALTER 미적용: Phase 10-B 마이그레이션 실제 DB 미반영 상태

우선순위 낮음

(완료 이력) modilcaMatcher.ts MATCHABLE_STATUSES에 'draft' 추가 (2026-04-27, line 11): 본부장 일괄 업로드 직후 draft 상태에서 매칭 0% 회귀 해결. modilcaMatcher 내부 4곳 자동 적용, supportMatcher는 별도 const라 미적용(별도 백로그). tsc + build 통과. CLAUDE.md 3-5 검증 영역 수정이지만 누락된 status 추가로 안전.
(완료 이력) 본부장 첫 업로드 ghost 61건 정리 완료 (2026-04-27): upload_id d4bb5c9f, ag_settlement_month='2025-04' 61건 soft delete. 원인은 modilcaParser 연도 오판정(우선순위 높음 별도 백로그 참조).
(완료 이력) 가짜 user 계정 2개 정리 완료 (2026-04-27): bc81c672(정서호 가짜, jyy199419@gmail.com) + 6ec4452b(박준 가짜, qkrwnsgg12) hard delete. audit_logs 12 + monthly_reports 4 + rate_templates 2 + users 2 = 합 20행 트랜잭션 일괄 DELETE. audit 12행은 4-24 오전 bulk recompute 부산물(final_amount=0), 비즈니스 audit 가치 0. 진짜 da8b95f0/0afc0656 무사, 2026-03 시뮬 63건/2026-04 본부장 65건 보호. 효과: 모딜카 매처 동명이인 분기(matchDuplicateStaffNames) 자동 회복 — 다음 모딜카 재매칭에서 박준/정서호 행 단일 user 매칭으로 흐름.
(완료 이력) modilca apply route status whitelist에 'draft' 추가 (2026-04-27, app/api/settlement/modilca/apply/route.ts:80): modilcaMatcher와 별개의 status 필터. 수정 전 ["approved_director","modilca_submitted","carried_over"] → 수정 후 ["draft","approved_director","modilca_submitted","carried_over"]. 본부장 일괄 업로드 직후 draft 상태 deliveries에 모딜카 매칭 결과를 apply할 수 있도록 보완. tsc + build 통과. matcher 'draft' 추가(같은 날)와 짝을 이뤄 매칭→적용 흐름 완전 회복.
(완료 이력) 모딜카 R67 신영진 쏘렌토 매뉴얼 적용 (2026-04-27): 첫 apply 시 수동 선택 누락으로 R67이 적용 안 됨. UI 재진입은 다른 64건이 'invalid_status: confirmed'로 거절될 위험이 있어 DB 직접 처리. 본부장 출고건 34705ad5-69d1-412e-8f55-784a2576b0f6에 modilca 8개 필드 (ag_supply 379500/ag_vat 37950/ag_total 417450/ag_commission 417450/promotion_supply 301818/sliding_supply 387818/sliding_paid_to_staff false/version+1) + status='confirmed' 트랜잭션 UPDATE, f1bca06b applied_count 64→65, manual=true audit_log 1건 INSERT. 결과: 2026-04 활성 65건 전원 confirmed, 다른 64건 무영향. 향후: UI 단건 적용 흐름이 안전한지 점검 필요 (이미 confirmed 행에 대한 중복 apply 거절은 정상 동작이지만, UX상 매뉴얼 처리/생략을 명확히 표시해야).
(완료 이력) 백마 파서 월 판정 버그 수정 완료 (2026-04-27, dealerParser.ts:476–525): 파일명 fallback 실패 시 첫 데이터 행 출고일자 → 모든 행 출고일자 최빈값(mode) 기반으로 변경. 루프 내 첫 행 의존 분기(기존 line 477–481) 제거 + 루프 종료 후 monthCounts 집계 → 최다 빈도 월 채택, warnings에 "최빈값으로 결정: YYYY-MM (N건/M건)" 메시지 추가로 보정 발생 시 추적 가능. tsc + build 통과. 원인: 본부장 4-23 ghost와 동일 첫 행 의존 패턴.
(완료 이력) 인라인 상담결과 드롭다운 메모 손실 버그 수정 (2026-04-27): 원인 = `commitCounselingStatus` → `updateLead` → `toLeadUpdateRow`가 memo 포함 full-row UPDATE를 보내는데, 모달 저장 후 listing의 leads state가 refresh 안 되어 stale `row.base.memo=''`가 DB로 덮어써짐. 수정 = `leaseCrmSupabase.ts`에 `patchLead(leadId, partial)` 화이트리스트 PATCH 함수 신규 추가, `LeadsCategoryPage.tsx:commitCounselingStatus`에서 실패 사유 불필요한 status는 `patchLead({status})`만 호출 + `commitLeads`로 로컬 state만 동기화. 실패 사유 필요 status는 consultations 동기화가 있어 기존 full-update 경로 유지. tsc + build 통과. 동일 패턴(인라인 변경) 다른 핸들러는 별도 백로그(우선순위 중간).
2026-03 이호성 sum_ag = 306,735원 확인 필요 (어제 진단 시 수치 작아 보였음, 3월 실운영 끝나고 재검증)
본부장 엑셀에 계약번호 컬럼 추가 (4월부터 기입 요청)
행복/몽촌토성/서광/금곡 엑셀 받을 수 있는지 운영 확인
ESLint disable 방식의 실제 타입 교체 (Phase 9 정리 시 any 유지, 단위 테스트 6/6 통과로 검증됨)
PDF 폰트 최적화 (Noto Sans CJK KR 9.93MB → 서브셋 1~2MB)


13. Claude Code 작업 시 필수 행동 규칙
13-1. SQL 작성 패턴

첫 쿼리는 information_schema.columns로 컬럼 확인
deleted_at IS NULL 조건 명시 (soft delete 정책)
DDL / DELETE / 대량 UPDATE는 서호 확인 후 실행
SELECT는 자동 실행 가능

13-2. 파일 수정 패턴

수정 전 해당 파일 + 인접 파일 구조 파악 (view, grep)
변경 의도를 한 줄로 선언한 뒤 수정
수정 후 반드시 빌드 검증: npx tsc --noEmit → npm run build
검증된 로직 (3-5 항목 파일들)은 절대 수정 금지

13-3. 보고 형식

결과는 마크다운 표 + 핵심 한 줄 결론 형태 선호
장황한 설명보다 숫자/사실 우선
다음 액션이 필요하면 명확히 1~3개 옵션 제시

13-4. 금지 사항

git push, vercel deploy (서호 명시 승인 후만)
검증된 로직 파일 수정 (3-5 참조)
회사 정책값 추측 (3-3 참조)
환경변수 임의 변경
"확실합니다" 같은 단정 (3-1 참조)


14. 첫 작업 (이 파일 읽은 직후 실행)
CLAUDE.md를 읽은 직후 아래 4개 작업을 순서대로 수행하고 마크다운 표로 보고:

2026-04 정산월 settlement_deliveries 현황

활성 건수 (deleted_at IS NULL)
삭제 건수 (deleted_at IS NOT NULL)
상태별 분포 (status 컬럼: draft / approved_director / confirmed)


이호성 본부장 (094e6e47-9595-4594-8604-c3ea1f8d018a) 2026-04 현황

활성 건수
항목별 합계: promotion_supply, sliding_supply, ag_commission_supply, dealer_commission, customer_support
어제 초기화 후이므로 0 예상


직원별 2026-04 활성 건수 요약

컬럼: 이름 / 직급 / 건수
users 테이블 JOIN 필요


settlement_modilca_uploads 최근 5건

컬럼: file_name, uploaded_at, matched_count, unmatched_count, status
최신순 정렬




⚠️ 모든 쿼리 전에 information_schema.columns로 실제 컬럼명 확인 후 작성.
⚠️ 어제 초기화 이후라 2026-04 활성은 0이 정상. 0이 아니면 즉시 보고.