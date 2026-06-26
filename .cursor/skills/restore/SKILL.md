---
name: restore
description: Resets korea-wc2026-tracker match scores on production or local after admin/Kakao tests. Use when the user asks to restore, revert, 원복, reset matches, or undo manual score test data.
---

# Restore (경기 스코어 원복)

수동 스코어·카카오 메모 테스트 후 **경기 상태를 `NS`(미시작)로 되돌린다.** 카카오 구독은 유지한다.

## 빠른 실행 (권장)

저장소 루트에서:

```bash
node .cursor/skills/restore/scripts/restore-matches.mjs
```

옵션:

| 옵션 | 설명 |
|------|------|
| (없음) | `/api/status`에서 `NS`가 아닌 경기만 자동 reset |
| `--all` | 1~6번 전부 reset (이미 `NS`면 스킵) |
| `--match 1 3` | 지정 경기만 reset |
| `--base URL` | 기본: `.env`의 `BASE_URL`, 없으면 Railway 프로덕션 URL |

## 수동 절차 (스크립트 없을 때)

1. `.env`에서 `ADMIN_SECRET` 로드
2. `GET {BASE}/api/status` — `status !== 'NS'` 또는 스코어 있는 경기 확인
3. 각 경기에 `POST {BASE}/api/admin/reset`:

```json
{ "matchId": 1, "secret": "<ADMIN_SECRET>" }
```

4. `GET /api/status` 재확인: `finishedCount: 0`, 해당 경기 `NS`

## 기본 URL

| 환경 | BASE |
|------|------|
| 프로덕션 | `https://korea-wc2026-tracker-production.up.railway.app` |
| 로컬 | `http://localhost:3000` |

로컬 `.env`의 `BASE_URL`이 `localhost`이면 **프로덕션 원복 시 `--base`로 Railway URL 지정**하거나 스크립트 기본값(프로덕션) 사용.

## 하지 않는 것

- 카카오 **구독 해지** (`DELETE /api/auth/unsubscribe`) — 사용자가 명시할 때만
- `app_meta.last_notification_hash` 삭제 — 동일 스코어 재테스트 시 메모 중복 방지용; 전체 원복 요청 시에만 언급

## 완료 기준

- 대시보드: 6경기 `NS`, 스코어 `—`
- `/api/status`: `finishedCount: 0` (테스트 전 상태였다면 `metCount: 0`)

## 추가 참고

- API 구현: `src/server/routes/admin.ts` (`POST /api/admin/reset`)
- 상세 옵션·에러: [reference.md](reference.md)
