# studuo / duoingsu

고정 2인이 하루 플랜, 시간별 실행 로그, 회고, 자료를 함께 쌓아가는 스터디 기록 웹앱입니다.

- 프로젝트명: `studuo`
- 서비스명: `duoingsu`
- 기준 환경: 데스크탑/노트북 웹 브라우저
- 배포 URL: `https://duoingsu.pages.dev`
- API URL: `https://duoingsu.trleresoo.workers.dev`

## 핵심 기능

- Google 로그인 + 허용 이메일 2개 화이트리스트 인증
- 최초 로그인 시 닉네임 1회 설정
- `logical_date` 기반 하루 경계 처리
- 홈: 시간별 실행 로그 타임라인
- 플랜: 하루 상태, 시간별 계획, 휴무/약속 반영, 응원 메시지
- 느낀 점: 감정 태그, 회고, 공감 반응
- 자료: 링크/파일/메모 공유, R2 파일 저장
- 대시보드: 계획과 실행 비교, 주간 기록률/집중도/태그 요약
- PWA/Web Push 알림

## 기술 스택

- Frontend: React, Vite, TypeScript
- Hosting: Cloudflare Pages
- API: Cloudflare Workers, Hono
- Auth: Firebase Authentication, `@hono/firebase-auth`
- DB: Cloudflare D1
- File Storage: Cloudflare R2
- Push: Web Push, VAPID, Service Worker

## 폴더 구조

- `apps/web`: Cloudflare Pages용 프론트엔드
- `apps/worker`: Cloudflare Workers API 서버
- `apps/worker/migrations`: D1 마이그레이션
- `shared`: 프론트/워커가 함께 쓰는 유틸리티

## 보안 주의

실제 이메일, Firebase Secret, VAPID Private Key 등은 커밋하지 않습니다.

- 허용 이메일은 `ALLOWED_EMAILS` 환경변수/시크릿으로만 관리합니다.
- README나 코드에는 실제 허용 이메일을 적지 않습니다.
- 예시 이메일은 `a@gmail.com,b@gmail.com`처럼 더미 값만 사용합니다.
- R2 파일은 Worker API를 통해서만 접근하도록 관리합니다.

## 환경변수

### Pages

Cloudflare Pages 환경변수에 설정합니다.

```env
VITE_API_BASE_URL=https://duoingsu.trleresoo.workers.dev
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=studuo-fa42b
VITE_FIREBASE_APP_ID=...
VITE_VAPID_PUBLIC_KEY=...
```

로컬 개발 시에는 `apps/web/.env.local`에 설정합니다.

참고 파일:

```txt
apps/web/.env.example
```

### Worker

Cloudflare Worker 환경변수/시크릿에 설정합니다.

```env
CORS_ORIGIN=https://duoingsu.pages.dev
FIREBASE_PROJECT_ID=studuo-fa42b
ALLOWED_EMAILS=a@gmail.com,b@gmail.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

`ALLOWED_EMAILS`, `VAPID_PRIVATE_KEY`는 시크릿으로 관리하는 것을 권장합니다.

```powershell
cd apps/worker
npx wrangler secret put ALLOWED_EMAILS
npx wrangler secret put VAPID_PRIVATE_KEY
```

VAPID 키 생성 예시:

```powershell
npx web-push generate-vapid-keys
```

## Cloudflare 리소스

`apps/worker/wrangler.toml`에 연결 정보가 있습니다.

- Worker name: `duoingsu`
- D1 binding: `DB`
- D1 database: `duoingsu-db`
- R2 binding: `R2`
- R2 bucket: `studuo-resources`
- KV binding: `PUBLIC_JWK_CACHE_KV`
- Cron: 매 정각, 매시 10분

```toml
[triggers]
crons = ["0 * * * *", "10 * * * *"]
```

`PUBLIC_JWK_CACHE_KV`는 `@hono/firebase-auth`의 Firebase 공개키 캐시에 필요합니다.

## 로컬 개발

의존성 설치:

```powershell
npm install
```

Worker 실행:

```powershell
npm run dev:worker
```

Web 실행:

```powershell
npm run dev:web
```

Vite 개발 서버는 `/api` 요청을 `http://127.0.0.1:8787` Worker dev 서버로 프록시합니다.

## 검증

전체 타입체크:

```powershell
npm run typecheck
```

Web 타입체크:

```powershell
npm -w apps/web run typecheck
```

Worker 타입체크:

```powershell
npm -w apps/worker run typecheck
```

Web 빌드:

```powershell
npm -w apps/web run build
```

## D1 마이그레이션

원격 D1에 마이그레이션 적용:

```powershell
cd apps/worker
npx wrangler d1 migrations apply duoingsu-db --remote
```

현재 마이그레이션:

- `0001_init.sql`: 기본 테이블
- `0002_users_name_locked.sql`: 닉네임 1회 설정 잠금
- `0003_reactions_multi_emoji.sql`: 회고 공감 다중 이모지
- `0004_plan_cheers.sql`: 플랜 응원 메시지
- `0005_push_subscriptions.sql`: 기기별 Push 구독

## 배포

Worker 배포:

```powershell
cd apps/worker
npx wrangler deploy
```

Pages는 GitHub 연동 배포 또는 Cloudflare Pages 재배포를 사용합니다.

Worker 코드, Cron, D1/R2/KV binding이 바뀌면 Worker 재배포가 필요합니다.

Web 코드, PWA, Firebase 설정이 바뀌면 Pages 재배포가 필요합니다.

## 알림 정책

알림 문구는 아래 파일의 `PUSH_MESSAGES`에서 관리합니다.

```txt
apps/worker/src/index.ts
```

현재 알림은 두 종류입니다.

### 이벤트 알림

사용자 행동 직후 발송됩니다.

- 친구가 `플랜 페이지 > 하루 상태`를 처음 저장
- 친구가 `플랜 페이지 > 내 하루 상태`에 응원글 작성/수정
- 친구가 `느낀 점 페이지`에서 내 회고에 공감 버튼 클릭

공감 취소 시에는 알림을 보내지 않습니다.

### 시간 기반 알림

Worker Cron으로 발송됩니다.

- 12시 이후 당일 플랜이 없으면 매 정각 알림
- 플랜이 적힌 시간 정각에 실행 알림
- 플랜은 있는데 홈 기록이 없으면 1시간 10분 뒤 알림

예시:

- `16:00` 플랜 있음 → `16:00` 실행 알림
- `16:00` 플랜 있음, 홈 `16:00` 기록 없음 → `17:10` 기록 알림

`02:00 ~ 08:59`에는 Cron 알림을 보내지 않습니다.

## Push 알림 사용 조건

기기별로 앱 안에서 반드시 구독해야 합니다.

```txt
설정 페이지 > 이 기기에서 푸시 알림 받기
```

Android:

- Chrome에서 접속
- 사이트 알림 권한 허용
- 설정 페이지에서 Push 구독 버튼 클릭

iOS/iPadOS:

- Safari에서 접속
- 홈 화면에 추가
- 홈 화면 앱으로 실행
- 설정 페이지에서 Push 구독 버튼 클릭

구독 저장 확인:

```powershell
cd apps/worker
npx wrangler d1 execute duoingsu-db --remote --command "SELECT u.name, COUNT(ps.id) AS push_count FROM users u LEFT JOIN push_subscriptions ps ON ps.user_id = u.id GROUP BY u.id, u.name;"
```

## 운영 메모

- 실제 사용 데이터 초기화는 신중하게 진행합니다.
- 닉네임을 다시 설정하려면 `users.name_locked`와 `users.name` 상태를 직접 조정해야 합니다.
- `logical_date`는 기본 06:00 기준입니다.
- `day_start_hour`는 기존 데이터 해석에 영향을 줄 수 있으므로 운영 중 변경하지 않는 것을 권장합니다.
