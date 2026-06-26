# 구현 가이드 (IMPLEMENTATION)

> 상위 설계: [DESIGN.md](./DESIGN.md)  
> Phase 1·2·3·4 구현 완료 기준: 2026-06-26  
> 프로덕션: https://korea-wc2026-tracker-production.up.railway.app

---

## 1. 기술 스택

| 영역 | 선택 | 사유 |
|------|------|------|
| 런타임 | Node.js 20+ | 상시 폴링·스케줄에 적합 |
| 언어 | TypeScript | 조건 판정·API 타입 안전 |
| 서버 | Hono + `@hono/node-server` | 경량, 정적 파일 서빙 |
| 클라이언트 | Vite + 바닐라 TS | 대시보드·`/go` 브릿지 |
| DB | SQLite (`node:sqlite`, Node 22+) | 네이티브 빌드 없음, 단일 인스턴스 |
| 테스트 | Vitest | `conditions.ts` 단위 테스트 |
| 배포 | Railway / Fly.io / VPS | serverless 부적합 (상시 폴링) |

---

## 2. 디렉터리 구조

```
korea-wc2026-tracker/
├── config/
│   └── matches.json              # 6경기 메타·킥오프·apiFixtureId
├── docs/
│   ├── DESIGN.md
│   └── IMPLEMENTATION.md         # 본 문서
├── scripts/
│   ├── setup-env.ts              # .env + 랜덤 시크릿 생성
│   ├── verify-kickoff.ts         # KickoffAPI 단독 검증
│   ├── verify-fixtures.ts        # 6경기 fixture resolve 검증
│   └── railway-deploy.sh         # Railway 변수·배포
├── .cursor/skills/restore/       # 테스트 후 경기 스코어 원복 스킬
├── src/
│   ├── shared/
│   │   ├── types.ts
│   │   ├── conditions.ts         # 6조건 판정 (순수 함수)
│   │   └── conditions.test.ts
│   ├── server/
│   │   ├── index.ts              # Hono 앱 엔트리
│   │   ├── load-env.ts           # .env 자동 로드
│   │   ├── db/
│   │   │   ├── index.ts          # SQLite 스키마·CRUD
│   │   │   ├── seed.ts
│   │   │   └── users.test.ts
│   │   ├── routes/
│   │   │   ├── status.ts         # GET /api/status
│   │   │   ├── admin.ts          # 수동 스코어·원복
│   │   │   ├── auth.ts           # 카카오 OAuth·구독
│   │   │   └── push.ts           # Web Push 구독
│   │   └── services/
│   │       ├── ...
│   │       ├── push.ts             # web-push 발송
│   │       └── notifier.ts         # 카카오톡 나와의 채팅 + Web Push
│   └── client/
│       ├── public/sw.js            # Service Worker
│       ├── index.html, go.html, admin.html
│       ├── main.ts, go.ts, env-detect.ts, admin.ts
│       └── styles.css
├── .env.example
├── railway.toml
├── package.json
├── vite.config.ts
└── vitest.config.ts
```

---

## 3. 구현 단계

### Phase 1 — 코어 (완료)

- [x] `config/matches.json` 시드
- [x] `evaluateCondition()` + Vitest
- [x] SQLite `match_states` 테이블
- [x] `GET /api/status`
- [x] 웹 대시보드 (1분 자동 갱신)

### Phase 2 — KickoffAPI 폴링 (완료)

- [x] 서버 기동 시 `apiFixtureId` 자동 조회 → DB 저장 + 홈/어웨이 검증
- [x] `kickoff-api.ts`: `GET /api/v1/fixtures?id=` / `fixtures?date=` (KST·UTC 날짜 보정)
- [x] `match-poller.ts`: 킥오프 **+110분**부터 **1분 간격**, 최대 **30회**
- [x] `FT` / `AET` / `PEN` + 골 확정 시 즉시 중단
- [x] 30회 초과 시 `poll_failed` → 대시보드 **「조회 실패」**
- [x] 종료 시 `notifier.onMatchFinished()` → 카카오톡 나와의 채팅 발송 (Phase 3)
- [x] `POST /api/admin/score` + `/admin` 관리 페이지

### Phase 3 — 카카오 (완료)

- [x] OAuth 로그인 (`scope=talk_message`, `prompt=consent`) → refresh token 암호화 저장
- [x] 세션 쿠키 (HMAC 서명) + `GET /api/auth/me`
- [x] OAuth `state` 서버 DB 저장 (`oauth_states`) — 모바일·인앱 브라우저 쿠키 유실 대비
- [x] 대시보드 구독/해지 UI + 성공·실패·해지 안내 배너
- [x] 구독 해지: DB 삭제 + 세션 삭제 + **카카오 `unlink` API** (재구독 시 동의 화면 강제)
- [x] 「나에게 보내기」피드 메시지 (스코어·충족 수 포함)
- [x] 중복 발송 방지 (`app_meta.last_notification_hash`)
- [x] `notification_log` 발송 이력
- [x] Railway 프로덕션 배포·E2E 검증 (구독 → 메모 수신 → 해지 → 재구독)

### Phase 4 — Web Push (완료)

- [x] VAPID 키 (`web-push`) — `setup-env`·Railway Variables
- [x] `push_subscriptions` 테이블 + 구독 API (`/api/push/*`)
- [x] Service Worker (`/sw.js`) + 카카오 구독 후 **선택적** 푸시 등록
- [x] `notifier`에 `web_push` 채널 (짧은 제목, 클릭 → `/go`)
- [x] 환경 감지 UI — 인앱·iOS·미지원은 **노란 경고 박스**, Android 차단 시 단계별 해제 안내
- [x] Android Chrome: `preparePush` 선행 로드, 버튼 탭 직후 권한 요청, 자동 차단 해제 안내
- [x] `/go` 브릿지 — 쿼리 파라미터 현황 + 카카오톡·웹 링크
- [x] 프로덕션 `BASE_URL`, HTTPS, Railway 배포
- [x] Android Chrome E2E (카카오 구독 + 푸시 허용 + 「푸시 알림 켜짐」)
- [x] 이정표 알림 — 32강 진출 확정·탈락 확정 제목·본문 강조 (`detectMilestone`)

---

## 4. API

### `GET /api/status` (Phase 1)

6경기 현황·충족 수·진출 가능 여부를 반환한다.

```json
{
  "updatedAt": "2026-06-26T12:00:00.000Z",
  "requiredMetCount": 3,
  "metCount": 0,
  "finishedCount": 0,
  "onTrack": null,
  "matches": [
    {
      "id": 1,
      "label": "세네갈 vs 이라크",
      "group": "I",
      "homeTeamKo": "세네갈",
      "awayTeamKo": "이라크",
      "kickoffKst": "2026-06-27T04:00:00+09:00",
      "homeScore": null,
      "awayScore": null,
      "conditionMet": null,
      "status": "NS",
      "requirement": "세네갈 1골차 이하 승 또는 이라크 4골차 이하 승",
      "finishedAt": null,
      "pollFailed": false
    }
  ]
}
```

- `onTrack`: 6경기 모두 종료 전 `null`, 종료 후 `metCount >= 3`이면 `true`
- `conditionMet`: 미종료 `null`, 종료 후 `true` / `false`

### `GET /health`

헬스체크 `{ "ok": true }`

### `POST /api/admin/score` (Phase 2)

수동 스코어 입력. body:

```json
{
  "matchId": 1,
  "homeScore": 1,
  "awayScore": 0,
  "secret": "ADMIN_SECRET 값"
}
```

- `secret` 불일치 → 401
- 성공 시 `status: MANUAL`, `poll_failed` 초기화

### `/admin` 관리 페이지

브라우저에서 스코어 입력. **저장할 때마다** `ADMIN_SECRET` 입력 필요.

### `POST /api/admin/reset` (Phase 2)

수동 입력 경기를 `NS`로 되돌림. body: `{ "matchId": 1, "secret": "..." }`

### 카카오 인증 (Phase 3)

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/auth/kakao` | 카카오 로그인 시작 (`scope=talk_message`, `prompt=consent`) |
| `GET /api/auth/kakao/callback` | OAuth 콜백 (서버 전용, 성공 시 `/?subscribed=1`) |
| `GET /api/auth/me` | `{ subscribed, kakaoEnabled, pushEnabled, pushSubscribed }` |
| `POST /api/auth/logout` | 세션 쿠키 삭제 (구독 DB는 유지) |
| `DELETE /api/auth/unsubscribe` | 카카오 `unlink` + DB 사용자 삭제 + 세션 삭제 |

**구독 해지 상세**

1. refresh token 복호화 → access token 발급
2. `POST https://kapi.kakao.com/v1/user/unlink` 호출 (실패해도 로컬 삭제는 진행)
3. `users`·`notification_log` 삭제, 세션 쿠키 제거

**OAuth state**

- `GET /api/auth/kakao` 시 `oauth_states` 테이블에 state 저장 (TTL 10분)
- 콜백에서 DB state 소비 또는 `oauth_state` 쿠키와 대조
- 실패 시 `/?auth_error=...` 로 리다이렉트 (클라이언트 배너 표시)

### Web Push (Phase 4)

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/push/vapid-public-key` | `{ enabled, publicKey? }` |
| `POST /api/push/subscribe` | 세션 필수, body: PushSubscription JSON |
| `DELETE /api/push/unsubscribe` | 세션 필수, 사용자 Push endpoint 전체 삭제 |

카카오 구독 후 **선택적** 푸시 등록. `notifier`가 동일 hash로 `kakao_memo` + `web_push` 병렬 발송.

---

## 4b. Fixture ID 자동 조회·검증 (Phase 2)

서버 기동 시 (`resolve-fixtures.ts`):

1. `KICKOFF_API_KEY` 없으면 스킵
2. DB/config에 `apiFixtureId` 없으면 `kickoffKst` 기준 KST·UTC 날짜로 `fixtures?league=1&season=2026&date=` 조회
3. `homeTeam`/`awayTeam`과 API 팀명 대조 (별칭: `Congo DR` ↔ `DR Congo` 등)
4. 일치 → DB에 `api_fixture_id` 저장
5. 불일치 → 로그 + `app_meta.fixture_mismatch_{id}` 기록, 해당 경기 폴링 제외

**배포 후 체크리스트**

- [ ] 서버 로그에 6경기 `verified` 또는 `resolved` 메시지 확인
- [ ] `fixture_mismatch` / `fixture_error` 없는지 확인
- [ ] 불일치 시 `config/matches.json`의 `homeTeam`/`awayTeam` 수정 또는 `apiFixtureId` 수동 입력 후 재기동

---

## 4c. Railway 배포

| 항목 | 권장 |
|------|------|
| 플랜 | Railway Hobby (Volume 지원) |
| Volume | `DATABASE_PATH` 경로에 SQLite 볼륨 마운트 (`/data`) |
| 운영 기간 | 6/26 저녁 ~ 6/28 경기 종료 후 서비스 중지 (선택) |
| env | `KICKOFF_API_KEY`, `ADMIN_SECRET`, `KAKAO_*`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `VAPID_*`, `BASE_URL`, `DATABASE_PATH`, `PORT`, `NODE_ENV=production` |

`railway.toml`: `buildCommand = "npm run build"`, `startCommand = "npm start"`

---

## 5. 조건 판정 (`src/shared/conditions.ts`)

FIFA 표기 **홈/어웨이** 스코어 기준 (`config/matches.json`의 `homeTeam` / `awayTeam` 순서).

| id | 필요 결과 | 판정 로직 |
|----|-----------|-----------|
| 1 | 세네갈 1골차 이하 승 또는 이라크 4골차 이하 승 | 홈 승 시 `diff≤1`, 어웨이 승 시 `diff≤4` |
| 2 | 스페인 승 | `away > home` |
| 3 | 이집트 승 | `home > away` |
| 4 | 가나 승 | `away > home` |
| 5 | 콩고민주 무/패 | `home ≤ away` |
| 6 | 오스트리아 승 또는 알제리 2골차+ 승 | 어웨이 승 또는 홈 승 `diff≥2` |

MVP에서는 FIFA 조 3위 중 상위 8팀 tie-break 시뮬레이션은 **제외** (DESIGN.md §1.3의 3/6 규칙만 적용).

---

## 6. DB 스키마

### `match_states`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| match_id | INTEGER PK | 1~6 |
| api_fixture_id | INTEGER | KickoffAPI fixture id |
| kickoff_kst | TEXT | ISO 8601 KST |
| home_score | INTEGER | null = 미확정 |
| away_score | INTEGER | |
| condition_met | INTEGER | null / 0 / 1 |
| status | TEXT | NS, LIVE, FT, AET, PEN, MANUAL |
| finished_at | TEXT | 종료 시각 |
| polling_started_at | TEXT | 첫 API 조회 시각 |
| poll_attempts | INTEGER | 폴링 회차 |
| poll_failed | INTEGER | 30회 초과 시 1 |
| last_poll_at | TEXT | 마지막 API 조회 시각 |

Phase 3·4: `users`, `notification_log`, `oauth_states`, `push_subscriptions`.

### `users` (Phase 3)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 내부 ID |
| kakao_user_id | TEXT UNIQUE | 카카오 회원번호 |
| refresh_token_enc | TEXT | AES-256-GCM 암호화 refresh token |
| created_at | TEXT | 구독 시각 |
| updated_at | TEXT | 토큰 갱신 시각 |

### `notification_log` (Phase 3)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | `users.id` ON DELETE CASCADE |
| channel | TEXT | `kakao_memo` \| `web_push` |
| notification_hash | TEXT | 중복 방지용 상태 해시 |
| payload_summary | TEXT | 발송 요약 |
| sent_at | TEXT | |
| success | INTEGER | 0 / 1 |
| error_message | TEXT | 실패 시 메시지 |

### `oauth_states` (Phase 3)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| state | TEXT PK | OAuth CSRF 토큰 |
| created_at | TEXT | 생성 시각 (10분 TTL 정리) |

### `push_subscriptions` (Phase 4)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | `users.id` ON DELETE CASCADE |
| endpoint | TEXT UNIQUE | Push endpoint URL |
| p256dh | TEXT | 구독 공개키 |
| auth | TEXT | auth secret |
| created_at | TEXT | |

### `app_meta` (Phase 2·3)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| key | TEXT PK | 예: `last_notification_hash`, `fixture_mismatch_{id}` |
| value | TEXT | |

---

## 7. 환경 변수

`.env.example` 참고. 필수 항목은 Phase별로 달라진다.

| 변수 | Phase | 용도 |
|------|-------|------|
| `PORT`, `BASE_URL` | 1 | 서버·OAuth 리다이렉트 |
| `DATABASE_PATH` | 1 | SQLite 경로 |
| `KICKOFF_API_KEY` | 2 | KickoffAPI (WC 2026 스코어·fixture) |
| `ADMIN_SECRET` | 2 | 수동 스코어 API |
| `KAKAO_REST_API_KEY` | 3 | 카카오 로그인 Client ID |
| `KAKAO_CLIENT_SECRET` | 3 | 카카오 Client Secret (보안 활성화 시) |
| `SESSION_SECRET` | 3 | 세션 쿠키 서명 |
| `TOKEN_ENCRYPTION_KEY` | 3 | refresh token 암호화 (64자 hex) |
| `VAPID_PUBLIC_KEY` | 4 | Web Push VAPID 공개키 |
| `VAPID_PRIVATE_KEY` | 4 | Web Push VAPID 비밀키 |
| `VAPID_SUBJECT` | 4 | `mailto:...` 또는 사이트 URL |

---

## 8. 로컬 실행

```bash
npm install
npm run setup:env        # .env 생성 (랜덤 시크릿). 이미 있으면 스킵
# .env 에 KICKOFF_API_KEY 입력
npm run verify:kickoff   # API만 검증 (DB 불필요)
npm run verify:fixtures  # 6경기 fixture ID·팀명 검증 (DB)
npm run dev              # API :3000, Vite :5173 (프록시 /api)
npm test
npm run build && npm start   # 프로덕션 빌드 후 단일 포트
npm run deploy:railway       # Railway CLI 배포 (로그인 후)
```

서버는 기동 시 `.env`를 자동 로드한다 (`src/server/load-env.ts`). Railway에서는 대시보드 Variables가 우선한다.

개발 시 브라우저는 `http://localhost:5173`, API는 `http://localhost:3000/api/status`.

---

## 8b. 배포·운영 체크리스트

### 자동화된 준비 (저장소에 포함)

| 항목 | 설명 |
|------|------|
| `npm run setup:env` | `.env` + 랜덤 시크릿·VAPID 키 |
| `npm run verify:kickoff` | KickoffAPI 2026 시즌·6경기·fixture by id 검증 |
| `npm run verify:fixtures` | DB 연동 fixture resolve·검증 |
| `railway.toml` | Railway 빌드(`npm run build`)·시작(`npm start`) |
| `.nvmrc` | Node 22 |
| `.cursor/skills/restore/` | admin·카카오 테스트 후 6경기 스코어 원복 |

### 프로덕션 (Railway) — 완료 항목

- [x] GitHub repo 연동·배포
- [x] Volume `/data` → `DATABASE_PATH=/data/app.db`
- [x] Variables: `KICKOFF_API_KEY`, `ADMIN_SECRET`, `KAKAO_*`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `VAPID_*`, `BASE_URL`, `NODE_ENV=production`
- [x] 도메인: `https://korea-wc2026-tracker-production.up.railway.app`
- [x] 카카오 Redirect URI 등록 + `talk_message` 동의
- [x] 기동 로그 6경기 fixture verified
- [x] 카카오 구독·나와의 채팅·해지·재구독 E2E
- [x] Android Chrome Web Push 구독 E2E

### 로컬 개발 시

1. `.env`에 `KICKOFF_API_KEY` 입력 → `npm run verify:kickoff` · `npm run verify:fixtures`
2. 카카오 로컬 Redirect URI: `http://localhost:3000/api/auth/kakao/callback`
3. `npm run dev` — Vite `:5173` (API 프록시 `/api`), 서버 `:3000`

### 6/28 이후

- [ ] 서비스 중지 (선택)

### KickoffAPI (실전 채택)

- 제공자: [KickoffAPI](https://kickoffapi.com/) — `league=1`, `season=2026`
- Base URL: `https://api.kickoffapi.com/api/v1`, 헤더 `x-api-key`
- 2026 WC 검증 완료 (2026-06-26): 6/6 fixture 매칭, `FT` 스코어 조회 OK
- 일 사용량: 경기당 최대 30회 × 3경기/일 + 기동 시 6회 ≈ **96회/일** (현실적으론 ~10~15회). 플랜 한도(예: 100,000/일) 대비 여유 충분
- 폴백: API 실패 시 `/admin` 수동 스코어

---

## 9. 폴링 정책 (Phase 2, DESIGN.md §8.3)

- 라이브 중 폴링 **없음**
- **킥오프 + 110분**부터 1분 간격, 최대 30회 (+140분까지)
- 무료 플랜 100회/일: 6경기·2일 운영 가능 (경기당 최악 30회 × 3경기/일 = 90회)
- KickoffAPI: 일 한도 내 여유 (검증 시 ~100,000/일 플랜 기준 충분)
- 종료 상태 `FT` / `AET` / `PEN` + goals 확정 시 즉시 중단
- 30회 초과 미종료 → `poll_failed=1`, 대시보드 **「조회 실패」** (별도 알림 없음)

---

## 10. 알림 메시지 형식 (Phase 3·4)

경기 종료·상태 변화 시에만 발송. `computeNotificationHash()`로 동일 스코어·조건이면 재발송 안 함.

**카카오 피드 (상세)** — `notification-message.ts`

```
[WC2026] 세네갈 1-0 이라크 종료
필요 결과: ✓ 충족
현황: 2/3 충족 (종료 3/6)
```

**대시보드 auth 배너 (Phase 3)**

| 상황 | 메시지 |
|------|--------|
| 구독 성공 (`?subscribed=1`) | 초록: 카카오 알림 구독이 완료되었습니다. |
| 구독 해지 | 회색: 카카오 알림 구독이 해지되었습니다… |
| OAuth 실패 (`?auth_error=`) | 빨강: 상황별 안내 |

**Web Push (짧게, Phase 4)**

```
세네갈 1-0 이라크 · 2/3 충족
```

이정표 도달 시:

```
32강 진출 확정!
탈락 확정
```

탭 → `/go` → `kakaotalk://launch`

### 푸시 UI 상태 (`main.ts` + `env-detect.ts`)

푸시 영역은 **카카오 구독 완료 후** 구독 카드 안에만 표시된다. `pushEnabled`(서버 VAPID)가 꺼져 있으면 영역 자체가 숨겨진다.

| 조건 | UI |
|------|-----|
| `pushSubscribed: true` | 「푸시 알림 켜짐」배지 + 「푸시 끄기」 |
| 지원 환경 + 권한 `default`/`granted` | 「푸시 알림 받기」버튼 + 허용 안내 |
| 지원 환경 + 권한 `denied` | 차단 안내(Android: ⋮·상세설정) + 「푸시 알림 받기」재시도 |
| 인앱 브라우저 | 노란 박스 — Chrome·Safari에서 직접 열기 |
| iOS 일반 탭 | 노란 박스 — 홈 화면 추가 안내 |
| Push API 미지원 | 노란 박스 — 나와의 채팅·웹 대시보드 안내 |

버튼 탭 후 일시 배너: 성공(초록), 거부·차단(빨강), 허용 창 닫기(회색).

---

## 11. 참고

- 상세 요구사항·비채택 방안: [DESIGN.md](./DESIGN.md)
- `apiFixtureId`는 서버 기동 시 KickoffAPI에서 자동 조회·검증 (§4b). 수동 입력은 `matches.json` 또는 DB fallback
