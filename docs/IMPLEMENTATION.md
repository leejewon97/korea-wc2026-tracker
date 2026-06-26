# 구현 가이드 (IMPLEMENTATION)

> 상위 설계: [DESIGN.md](./DESIGN.md)  
> Phase 1 구현 완료 기준: 2026-06-26

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
│   └── matches.json          # 6경기 메타·킥오프·apiFixtureId
├── docs/
│   ├── DESIGN.md
│   └── IMPLEMENTATION.md     # 본 문서
├── src/
│   ├── shared/
│   │   ├── types.ts
│   │   ├── conditions.ts     # 6조건 판정 (순수 함수)
│   │   └── conditions.test.ts
│   ├── server/
│   │   ├── index.ts          # Hono 앱 엔트리
│   │   ├── db/
│   │   │   ├── index.ts      # SQLite 스키마·CRUD
│   │   │   └── seed.ts
│   │   ├── routes/
│   │   │   └── status.ts     # GET /api/status
│   │   └── services/
│   │       └── status.ts     # DB + config → 응답 조립
│   └── client/
│       ├── index.html        # 대시보드
│       ├── go.html           # kakaotalk:// 브릿지
│       ├── main.ts
│       └── styles.css
├── .env.example
├── package.json
├── vite.config.ts
└── vitest.config.ts
```

### Phase 2~4에서 추가 예정

```
src/server/
├── services/
│   ├── kickoff-api.ts        # KickoffAPI 클라이언트
│   ├── match-poller.ts       # 킥오프+110분~ 폴링
│   └── notifier.ts           # 상태 변화 시 알림 조율
├── services/kakao.ts         # OAuth·나에게 보내기
├── routes/
│   ├── auth.ts
│   ├── push.ts
│   └── admin.ts              # 수동 스코어 (ADMIN_SECRET)
└── jobs/
    └── scheduler.ts          # setInterval 기반 폴링 트리거
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
- [x] 종료 시 `notifier.onMatchFinished()` 스텁 (Phase 3·4)
- [x] `POST /api/admin/score` + `/admin` 관리 페이지

### Phase 3 — 카카오

- [ ] OAuth 로그인 → refresh token 암호화 저장
- [ ] 「나에게 보내기」피드 메시지 (스코어·충족 수 포함)
- [ ] 중복 발송 방지 (`last_notified_hash` 등)

### Phase 4 — Web Push + 배포

- [ ] VAPID 키 생성 (`web-push`)
- [ ] 구독 등록 API + Service Worker
- [ ] Push 제목에 스코어, 클릭 시 `/go` → `kakaotalk://launch`
- [ ] 프로덕션 `BASE_URL`, HTTPS, 상시 프로세스 배포

---

## 4. API (Phase 1)

### `GET /api/status`

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

## 4c. Railway Free 배포 (Phase 2 문서화)

| 항목 | 권장 |
|------|------|
| 플랜 | Railway Free ($1/월 크레딧) |
| RAM | 256MB |
| Volume | `DATABASE_PATH` 경로에 SQLite 볼륨 마운트 |
| 운영 기간 | 6/26 저녁 ~ 6/28 경기 종료 후 서비스 중지 |
| env | `KICKOFF_API_KEY`, `ADMIN_SECRET`, `DATABASE_PATH`, `PORT` |

Start command: `npm run build && npm start`

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

Phase 3+에서 `users`, `push_subscriptions`, `notification_log` 테이블 추가.

---

## 7. 환경 변수

`.env.example` 참고. 필수 항목은 Phase별로 달라진다.

| 변수 | Phase | 용도 |
|------|-------|------|
| `PORT`, `BASE_URL` | 1 | 서버·OAuth 리다이렉트 |
| `DATABASE_PATH` | 1 | SQLite 경로 |
| `KICKOFF_API_KEY` | 2 | KickoffAPI (WC 2026 스코어·fixture) |
| `ADMIN_SECRET` | 2 | 수동 스코어 API |

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

## 8b. Phase 3 이전 체크리스트

### 자동화된 준비 (저장소에 포함)

| 항목 | 설명 |
|------|------|
| `npm run setup:env` | `.env` + 랜덤 `ADMIN_SECRET` |
| `npm run verify:kickoff` | KickoffAPI 2026 시즌·6경기·fixture by id 검증 |
| `npm run verify:fixtures` | DB 연동 fixture resolve·검증 |
| `railway.toml` | Railway 빌드·시작 명령 |
| `.nvmrc` | Node 22 |

### 당신이 직접 해야 할 것

1. **`.env`에 `KICKOFF_API_KEY` 입력** → `npm run verify:kickoff` · `npm run verify:fixtures` (6/6 OK 확인)
2. **`ADMIN_SECRET` 기록** — `setup:env`로 생성됐다면 `.env`에서 확인·복사해 둘 것
3. **GitHub에 repo 푸시** (원격 없으면 `git remote add` 후 push)
4. **Railway** (6/26 전)
   - GitHub repo 연결, Free 플랜
   - Variables: `KICKOFF_API_KEY`, `ADMIN_SECRET`, `DATABASE_PATH=/data/app.db`, `PORT=3000`
   - Volume `/data` 마운트, RAM 256MB
   - Deploy 로그에서 fixture 6경기 OK 확인
5. **6/26 저녁 배포 · 6/28 이후 서비스 중지**

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

경기 종료·상태 변화 시에만 발송. 동일 스코어·조건이면 재발송 안 함.

**카카오 피드 (상세)**

```
[WC2026] 세네갈 1-0 이라크 종료
필요 결과: ✓ 충족
현황: 2/3 충족 (종료 3/6)
```

**Web Push (짧게)**

```
세네갈 1-0 이라크 · 2/3 충족
```

탭 → `/go` → `kakaotalk://launch`

---

## 11. 참고

- 상세 요구사항·비채택 방안: [DESIGN.md](./DESIGN.md)
- `apiFixtureId`는 서버 기동 시 KickoffAPI에서 자동 조회·검증 (§4b). 수동 입력은 `matches.json` 또는 DB fallback
