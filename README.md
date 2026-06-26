# 대한민국 2026 월드컵 32강 진출 트래커

2026 FIFA 월드컵 조별리그 막바지, **대한민국(A조 3위)이 조 3위 중 상위 8팀에 들어 32강에 진출할 수 있는지**를 추적하고, 관련 경기 결과에 따라 구독자에게 알림을 보내는 웹 서비스입니다.

**프로덕션:** https://korea-wc2026-tracker-production.up.railway.app

---

## 주요 기능

- **실시간 현황 대시보드** — 6개 핵심 경기의 스코어·조건 충족 여부·진출 가능성 표시 (1분 자동 갱신)
- **KickoffAPI 폴링** — 경기 종료 후 자동으로 스코어를 가져와 조건 판정
- **카카오톡 나와의 채팅** — 카카오 로그인 구독 시 경기 종료마다 상세 현황 메모 발송
- **Web Push** — Android Chrome 등 지원 환경에서 짧은 제목 알림 (탭 시 `/go` 브릿지 페이지)
- **이정표 알림** — 32강 진출·탈락 확정 시 최종 알림 후 자동 구독 해지

---

## 진출 조건 요약

12개 조 중 각 조 1·2위 + **조 3위 중 상위 8팀**이 32강에 진출합니다. 아래 **6가지 조건 중 3가지 이상** 충족 시 대한민국 32강 진출이 가능합니다.

| # | 경기 | 필요 결과 |
|---|------|-----------|
| 1 | 세네갈 vs 이라크 (I조) | 세네갈 1골차 이하 승 **또는** 이라크 4골차 이하 승 |
| 2 | 우루과이 vs 스페인 (H조) | 스페인 승리 |
| 3 | 이집트 vs 이란 (G조) | 이집트 승리 |
| 4 | 크로아티아 vs 가나 (L조) | 가나 승리 |
| 5 | 콩고민주공화국 vs 우즈베키스탄 (K조) | 콩고민주공화국 무승부 또는 패배 |
| 6 | 알제리 vs 오스트리아 (J조) | 오스트리아 승리 **또는** 알제리 2골차 이상 승리 |

자세한 일정·시나리오·설계 배경은 [docs/DESIGN.md](docs/DESIGN.md)를 참고하세요.

---

## 기술 스택

| 영역 | 선택 |
|------|------|
| 런타임 | Node.js 22+ |
| 서버 | Hono + `@hono/node-server` |
| 클라이언트 | Vite + 바닐라 TypeScript |
| DB | SQLite (`node:sqlite`) |
| 테스트 | Vitest |
| 배포 | Railway |

---

## 빠른 시작 (로컬)

### 요구 사항

- Node.js **22** 이상 (`.nvmrc` 참고)
- [KickoffAPI](https://kickoffapi.com) API 키 (스코어·fixture 조회)
- 카카오 로그인·나에게 보내기 테스트 시 [카카오 개발자](https://developers.kakao.com) 앱 키

### 설치 및 실행

```bash
npm install
npm run setup:env        # .env 생성 (랜덤 시크릿·VAPID 키). 이미 있으면 스킵
```

`.env`에 `KICKOFF_API_KEY`와 (선택) `KAKAO_*` 값을 입력한 뒤:

```bash
npm run verify:kickoff   # KickoffAPI 연결 검증
npm run verify:fixtures  # 6경기 fixture ID·팀명 검증
npm run dev              # API :3000, Vite :5173 (프록시 /api)
```

개발 시 브라우저는 `http://localhost:5173`, API는 `http://localhost:3000/api/status`입니다.

프로덕션과 동일한 단일 포트로 실행하려면:

```bash
npm run build
npm start                # http://localhost:3000
```

---

## npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 서버·클라이언트 동시 개발 모드 |
| `npm run build` | 클라이언트(Vite) + 서버(TypeScript) 빌드 |
| `npm start` | `dist/server` 프로덕션 서버 실행 |
| `npm test` | Vitest 단위 테스트 |
| `npm run db:seed` | DB 시드 (`config/matches.json` 기준) |
| `npm run setup:env` | `.env` 초기 생성 |
| `npm run verify:kickoff` | KickoffAPI 단독 검증 |
| `npm run verify:fixtures` | 6경기 fixture resolve 검증 |
| `npm run deploy:railway` | Railway CLI 배포 스크립트 |

---

## 환경 변수

`.env.example`을 참고하세요. 주요 항목:

| 변수 | 용도 |
|------|------|
| `PORT`, `BASE_URL` | 서버 포트·OAuth 리다이렉트 URL |
| `DATABASE_PATH` | SQLite DB 경로 |
| `KICKOFF_API_KEY` | KickoffAPI 스코어·fixture |
| `ADMIN_SECRET` | 관리자 수동 스코어 API (`/admin`) |
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | 카카오 OAuth |
| `SESSION_SECRET` | 세션 쿠키 HMAC 서명 |
| `TOKEN_ENCRYPTION_KEY` | refresh token 암호화 (64자 hex) |
| `VAPID_*` | Web Push VAPID 키 |

`npm run setup:env`가 `ADMIN_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, VAPID 키를 자동 생성합니다.

---

## 프로젝트 구조

```
korea-wc2026-tracker/
├── config/matches.json       # 6경기 메타·킥오프·fixture ID
├── docs/
│   ├── DESIGN.md             # 설계·아키텍처·진출 조건 상세
│   └── IMPLEMENTATION.md     # API·DB·배포 가이드
├── scripts/                  # setup-env, verify, Railway 배포
├── src/
│   ├── shared/               # 조건 판정 (conditions.ts)
│   ├── server/               # Hono API·폴링·알림
│   └── client/               # 대시보드·/go·/admin
└── railway.toml
```

---

## 배포 (Railway)

상시 폴링이 필요하므로 serverless보다 **Railway·VPS** 등 상시 실행 환경에 적합합니다.

1. Railway에 Volume 마운트 (`DATABASE_PATH=/data/app.db` 권장)
2. `.env.example` 항목을 Railway Variables에 설정 (`NODE_ENV=production`, `BASE_URL` 포함)
3. 카카오 개발자 콘솔에 Redirect URI 등록: `{BASE_URL}/api/auth/kakao/callback`
4. `npm run deploy:railway` 또는 GitHub 연동 자동 배포

자세한 체크리스트는 [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) §4c, §8b를 참고하세요.

---

## 문서

- [DESIGN.md](docs/DESIGN.md) — 프로젝트 목적, 알림 방안, 시스템 아키텍처
- [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) — API 명세, DB 스키마, 로컬·프로덕션 운영

---

## 라이선스

개인 프로젝트 (private).
