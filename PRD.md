# duoingsu PRD v4

> **프로젝트명:** `studuo`  
> **서비스명:** `duoingsu`  
> **작성/갱신일:** 2026년 5월 24일  
> **대상 사용자:** 고정 2인  
> **목표:** 두 사람이 하루 플랜, 시간별 실행 로그, 회고, 자료, 응원, 알림을 함께 쌓아가는 2인 전용 스터디 기록 웹앱  
> **타겟 환경:** 데스크탑/노트북 웹 브라우저 기준, 모바일은 Push 알림 수신용 PWA 사용

---

## 1. 변경 이력

| 버전 | 변경 내용 |
| --- | --- |
| v1 | 최초 작성 |
| v2 | 모바일 대응 제외 / 30초 폴링 확정 / `@hono/firebase-auth` 인증 확정 |
| v3 | `logical_date` 도입 / 휴무 기능 / 일정·약속 기능 / 알림 3단계 필터 / DB 스키마 전면 업데이트 |
| v4 | 프로젝트명·서비스명 확정 / 닉네임 1회 설정 / 홈·플랜 생선가시 UI 통일 / 대시보드 분리 / 플랜 응원 / 다중 공감 / PWA Web Push / 플랜 중심 Cron 알림 정책 확정 |

---

## 2. 프로젝트 개요

### 2.1 배경

혼자 공부 기록을 남기는 것보다, 고정된 한 명과 서로의 계획과 실행을 공유할 때 지속성과 긴장감이 높아진다. `duoingsu`는 셋로그처럼 서로를 자연스럽게 재촉하되, 영상 대신 텍스트 기반의 계획·실행·회고 기록을 쌓는다.

### 2.2 핵심 컨셉

- 하루 시작 시 플랜과 하루 상태를 작성한다.
- 시간대별 계획을 세우고, 홈 타임라인에 실제 실행 로그를 남긴다.
- 상대방의 플랜/로그/회고를 볼 수 있다.
- 친구가 내 하루 상태에 응원글을 남길 수 있다.
- 친구가 내 회고에 여러 공감 이모지를 남길 수 있다.
- 계획이 없거나, 계획 실행 시간이 되었거나, 계획 대비 실행 로그가 비어 있으면 Push 알림으로 알려준다.
- **"잠들기 전까지는 같은 날"**이라는 원칙으로 `logical_date`를 사용한다.

### 2.3 기준 사용자

| 항목 | 내용 |
| --- | --- |
| 사용자 수 | 고정 2명 |
| 가입 방식 | 별도 회원가입/초대 없음 |
| 인증 | Google 로그인 + 서버 화이트리스트 |
| 사용자 구분 | Firebase UID |
| 표시 이름 | 최초 로그인 시 닉네임 1회 설정 |
| 닉네임 규칙 | 한글/영문/숫자만 허용, 2~12자 |
| 플랫폼 | Web + PWA 알림 |

---

## 3. 하루 경계 설계

### 3.1 `logical_date`

`logical_date`는 실제 캘린더 날짜가 아니라 앱에서 사용하는 체감 날짜다.

기본 하루 시작 시각은 **06:00**이다.

```txt
실제 시각                logical_date
------------------------------------------------
4월 19일 07:00  →  4월 19일
4월 19일 23:00  →  4월 19일
4월 20일 01:30  →  4월 19일
4월 20일 05:59  →  4월 19일
4월 20일 06:00  →  4월 20일
```

### 3.2 타임라인 순서

같은 `logical_date`의 시간축은 `06:00 ~ 다음날 05:00` 순서로 표시한다.

```txt
06:00
07:00
...
23:00
00:00
01:00
...
05:00
```

### 3.3 운영 정책

`day_start_hour`는 기본 6으로 유지한다. 기존 데이터의 날짜 해석에 영향을 줄 수 있으므로 운영 중 변경하지 않는 것을 권장한다.

---

## 4. 메뉴 구조

```txt
홈
대시보드
플랜
느낀 점
자료
설정
```

---

## 5. 기능 명세

### 5.1 공개/로그인 화면

로그아웃 또는 미인증 사용자는 공개 화면만 볼 수 있다.

- 서비스명 표시
- 비공개 스터디 로그 안내
- Google 로그인 버튼
- 허용되지 않은 계정은 앱 내부 데이터 접근 불가

### 5.2 인증 및 닉네임

- Firebase Google 로그인 사용
- Worker에서 `@hono/firebase-auth`로 ID Token 검증
- `ALLOWED_EMAILS` 환경변수로 허용 계정 제한
- 최초 로그인 후 닉네임 설정 모달 표시
- 닉네임은 한 번 설정하면 앱 화면에서 변경 불가
- 닉네임은 앱 상단, 타임라인, 플랜, 회고 등에 표시

### 5.3 홈

목적: 오늘 둘이 각각 어떤 시간에 무엇을 했는지 한눈에 확인한다.

레이아웃:

- 생선가시형 2열 타임라인
- 가운데 시간축
- 첫 로그인 사용자를 왼쪽, 이후 로그인 사용자를 오른쪽에 고정
- 시간축은 06:00부터 다음날 05:00까지 표시

상태:

| 상태 | 표시 |
| --- | --- |
| 로그 있음 | 작업 내용, 태그, 집중도 |
| 로그 없음 | 빈 칸 |
| 휴무 | 이름 옆 또는 상단 배지, 해당 사용자 칸 입력 차단 |
| 약속 | 해당 시간대에 약속 배지 표시, 입력 차단 |

기능:

- 내 칸만 입력 가능
- 상대 칸은 읽기 전용
- 날짜 이동 가능
- 30초 폴링으로 최신 데이터 반영

입력:

- 작업 요약: 최대 200자
- 태그: 학습, 코딩, 회의, 휴식, 기타
- 집중도: 낮음, 보통, 높음

### 5.4 플랜

목적: 하루의 상태와 시간별 계획을 공유한다.

구성:

- 내 하루 상태
- 상대 하루 상태
- 상대 하루 상태에 대한 응원 메시지
- 시간별 계획 생선가시 UI

하루 상태:

| 항목 | 내용 |
| --- | --- |
| 컨디션 | 5단계 |
| 날씨 | sunny, cloudy, rainy, snow, foggy |
| 오늘 목표 | 50자 이내 |

응원:

- 상대의 하루 상태 아래 한 줄 응원 작성 가능
- 작성/수정 시 상대에게 Push 알림 발송

시간별 계획:

- 내 칸만 입력/수정 가능
- 휴무/약속 시간대에는 입력 불가
- 상대 계획은 읽기 전용
- 첫 로그인 사용자 왼쪽, 두 번째 로그인 사용자 오른쪽

### 5.5 느낀 점

목적: 하루의 감정과 회고를 남기고, 상대방 회고에 공감한다.

입력:

- 감정 태그 다중 선택
- 오늘 잘한 것
- 오늘 아쉬운 것
- 자유 회고

공감:

- 이모지: 👍, 💪, ❤️
- 여러 공감 동시 선택 가능
- 같은 이모지를 다시 누르면 취소
- 새 공감 추가 시 회고 작성자에게 Push 알림 발송
- 공감 취소 시에는 알림 미발송

### 5.6 자료

목적: 공부 중 발견한 자료를 공유한다.

타입:

| 타입 | 내용 |
| --- | --- |
| 링크 | URL, 제목, 메모, OG 정보 |
| 파일 | PDF/이미지 등 R2 업로드 |
| 메모 | 짧은 텍스트, 코드 조각 |

기능:

- 검색
- 날짜 필터
- 태그
- 올린 사람 표시
- 핀 고정
- 링크 중복 체크
- 파일 다운로드는 인증된 API 경유

### 5.7 대시보드

목적: 계획과 실행의 차이를 확인하고, 주간 기록 흐름을 요약한다.

구성:

- 주간 기록률
- 평균 집중도
- 많이 쓴 태그
- 계획과 실행 비교표

비교 기준:

- `plan_items`: 계획
- `time_logs`: 실행
- `day_offs`, `schedules`: 기록 대상 시간에서 제외

### 5.8 설정

구성:

- 휴무 관리
- 약속 관리
- Push 알림 구독

휴무:

- 휴무 날짜 별도 선택
- 메모 입력 가능
- 등록/해제 가능

약속:

- 약속 날짜 별도 선택
- 시작/종료 시간
- 제목
- 등록/삭제 가능

Push:

- 기기별로 `이 기기에서 푸시 알림 받기` 버튼 클릭 필요
- 구독 정보는 `push_subscriptions` 테이블에 저장

---

## 6. 알림 정책

알림은 Web Push만 사용한다. 이메일 폴백은 현재 구현 범위에서 제외한다.

알림 문구는 Worker의 `PUSH_MESSAGES` 상수에서 관리한다.

```txt
apps/worker/src/index.ts
```

### 6.1 이벤트 알림

사용자 행동 직후 발송된다.

| 조건 | 대상 | 이동 |
| --- | --- | --- |
| 친구가 하루 상태를 처음 저장 | 상대방 | `/plan` |
| 친구가 내 하루 상태에 응원글 작성/수정 | 나 | `/plan` |
| 친구가 내 회고에 공감 버튼 클릭 | 나 | `/reflection` |

정책:

- 하루 상태 저장 알림은 같은 날짜 첫 저장 시에만 발송
- 하루 상태 수정 시에는 미발송
- 응원글은 작성/수정 모두 발송
- 공감은 새로 누를 때만 발송
- 공감 취소는 미발송
- 자기 자신에게는 알림 발송하지 않음

### 6.2 시간 기반 알림

Worker Cron으로 발송한다.

Cron:

```toml
crons = ["0 * * * *", "10 * * * *"]
```

#### 6.2.1 당일 플랜 없음 알림

조건:

- 낮 12시 이후
- 오늘 휴무가 아님
- 오늘 약속이 없음
- 당일 `plan_items`가 하나도 없음

발송:

- 12:00 첫 발송
- 이후 플랜이 생길 때까지 매 정각 발송

#### 6.2.2 플랜 시간 시작 알림

조건:

- 해당 시간에 `plan_items` 있음
- 오늘 휴무가 아님
- 해당 시간이 약속 시간대가 아님

발송:

- 계획된 시간 정각

예시:

```txt
16:00 플랜 있음 → 16:00 알림
```

#### 6.2.3 계획 대비 실행 기록 누락 알림

조건:

- 대상 시간에 `plan_items` 있음
- 대상 시간의 `time_logs` 없음
- 오늘 휴무가 아님
- 대상 시간이 약속 시간대가 아님

발송:

- 계획 시간으로부터 1시간 10분 뒤

예시:

```txt
16:00 플랜 있음
17:10까지 홈 16:00 로그 없음
17:10 알림
```

### 6.3 조용한 시간대

`02:00 ~ 08:59`에는 Cron 기반 알림을 보내지 않는다.

### 6.4 PWA 조건

Android:

- Chrome 접속
- 사이트 알림 권한 허용
- 앱 설정 페이지에서 Push 구독

iOS/iPadOS:

- Safari 접속
- 홈 화면에 추가
- 홈 화면 앱으로 실행
- 앱 설정 페이지에서 Push 구독

---

## 7. 실시간 동기화

WebSocket 대신 30초 폴링을 사용한다.

대상:

- 홈
- 플랜
- 느낀 점
- 자료
- 대시보드

2인 앱이므로 요청량은 무료 티어 내에서 충분하다.

---

## 8. 기술 설계

### 8.1 전체 구조

```txt
Cloudflare Pages
  React + Vite + TypeScript
        |
        | HTTPS REST API
        v
Cloudflare Workers
  Hono
  @hono/firebase-auth
  Cron Trigger
        |
        +-- Cloudflare D1
        +-- Cloudflare R2
        +-- Cloudflare KV

Firebase Authentication
  Google Login

Web Push
  Service Worker
  VAPID
```

### 8.2 주요 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| API | Cloudflare Workers, Hono |
| Auth | Firebase Auth, `@hono/firebase-auth` |
| DB | Cloudflare D1 |
| File | Cloudflare R2 |
| Push | Web Push, Service Worker, VAPID |
| Hosting | Cloudflare Pages |

### 8.3 배포 리소스

| 항목 | 값 |
| --- | --- |
| Pages URL | `https://duoingsu.pages.dev` |
| Worker URL | `https://duoingsu.trleresoo.workers.dev` |
| Worker name | `duoingsu` |
| Firebase project id | `studuo-fa42b` |
| D1 database | `duoingsu-db` |
| R2 bucket | `studuo-resources` |
| KV binding | `PUBLIC_JWK_CACHE_KV` |

---

## 9. 인증/보안

### 9.1 인증 흐름

```txt
브라우저 Google 로그인
→ Firebase ID Token 발급
→ API 요청 시 Authorization: Bearer <token>
→ Worker에서 Firebase Token 검증
→ ALLOWED_EMAILS 화이트리스트 확인
→ 허용 시 API 처리
```

### 9.2 보안 정책

- 실제 허용 이메일은 문서/코드에 커밋하지 않는다.
- `ALLOWED_EMAILS`는 Worker secret 또는 환경변수로 관리한다.
- `VAPID_PRIVATE_KEY`는 Worker secret으로 관리한다.
- Firebase Web App config는 Pages 환경변수로 관리한다.
- R2 파일은 인증된 API 경유로 다운로드한다.

---

## 10. DB 스키마 요약

현재 마이그레이션 기준:

| 테이블 | 역할 |
| --- | --- |
| `users` | 사용자, 닉네임, 하루 시작 기준 |
| `plans` | 일별 하루 상태 |
| `plan_items` | 시간별 계획 |
| `time_logs` | 시간별 실행 로그 |
| `day_offs` | 휴무 |
| `schedules` | 약속 |
| `reflections` | 회고 |
| `reactions` | 회고 공감 |
| `resources` | 자료 공유 |
| `plan_cheers` | 하루 상태 응원 메시지 |
| `push_subscriptions` | 기기별 Push 구독 |

마이그레이션 파일:

```txt
0001_init.sql
0002_users_name_locked.sql
0003_reactions_multi_emoji.sql
0004_plan_cheers.sql
0005_push_subscriptions.sql
```

---

## 11. 구현 상태

### 완료

- Cloudflare Pages/Workers/D1/R2/KV 기반 구성
- Firebase Google 로그인
- 허용 이메일 화이트리스트
- 닉네임 1회 설정
- 홈 타임라인
- 플랜 생선가시 UI
- 휴무/약속 등록 및 표시
- 느낀 점/회고/공감
- 자료 공유
- 파일 업로드/다운로드
- 대시보드
- PWA manifest/service worker
- Web Push 구독
- 이벤트 알림
- 플랜 중심 Cron 알림
- 30초 폴링

### 남은 개선 후보

| 항목 | 우선순위 | 내용 |
| --- | --- | --- |
| 알림 설정 세분화 | 중 | 사용자별 알림 ON/OFF, 시간대 설정 |
| 알림 테스트 버튼 | 중 | 설정 페이지에서 즉시 테스트 Push 발송 |
| 온보딩 | 중 | 첫 사용 안내 |
| 통계 고도화 | 낮음 | 월간/태그/스트릭/히트맵 |
| 모바일 UI 최적화 | 낮음 | 현재는 알림 수신 중심 PWA |
| 다크모드 | 낮음 | 선택 기능 |

---

## 12. 운영/테스트 체크리스트

### 배포 전

- `npm -w apps/web run typecheck`
- `npm -w apps/worker run typecheck`
- `npm -w apps/web run build`
- Worker 환경변수/시크릿 확인
- Pages 환경변수 확인
- D1 마이그레이션 적용 여부 확인

### Push 확인

```powershell
cd apps/worker
npx wrangler d1 execute duoingsu-db --remote --command "SELECT u.name, COUNT(ps.id) AS push_count FROM users u LEFT JOIN push_subscriptions ps ON ps.user_id = u.id GROUP BY u.id, u.name;"
```

### Cron 확인

```powershell
cd apps/worker
npx wrangler tail
```

예상 로그:

```txt
[Cron] triggered at 16:00 KST
[Cron] triggered at 16:10 KST
```

---

## 13. 리스크

| 리스크 | 내용 | 대응 |
| --- | --- | --- |
| iOS Push 조건 | Safari + 홈 화면 추가 + 권한 허용 필요 | 설정 안내와 실제 기기 테스트 |
| Android Push 누락 | 사이트 권한 또는 앱 내 구독 누락 가능 | 설정 페이지 구독 버튼, DB 구독 수 확인 |
| `logical_date` 변경 | 기존 데이터 해석이 달라질 수 있음 | 운영 중 `day_start_hour` 변경 지양 |
| 알림 과다 | 플랜/실행 알림이 잦을 수 있음 | 추후 사용자별 알림 설정 추가 |
| R2 파일 접근 | URL 직접 노출 시 보안 문제 | 인증된 Worker API로만 다운로드 |

---

## 14. 최종 요약

`duoingsu`는 고정 2인이 서로의 하루 계획과 실행을 확인하고, 회고와 자료를 함께 쌓으며, 필요한 순간 Push 알림으로 다시 앱에 돌아오게 만드는 스터디 기록 웹앱이다.

현재 버전은 실제 사용 가능한 MVP를 넘어, 2인 운영에 필요한 인증·기록·회고·자료·대시보드·PWA 알림까지 포함한 실사용 버전이다.

---

*v4 — 2026년 5월 24일 기준 최종 PRD*
