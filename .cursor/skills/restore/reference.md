# Restore — reference

## API

`POST /api/admin/reset`

- Body: `{ "matchId": 1..6, "secret": "<ADMIN_SECRET>" }`
- 성공: `{ "ok": true, "matchId": N }`
- 401: secret 불일치
- 404: 경기 없음

DB에서 해당 경기: 스코어·`condition_met`·`finished_at`·폴링 카운터 초기화, `status: NS`.

## 스크립트 exit code

| Code | 의미 |
|------|------|
| 0 | reset 불필요 또는 전부 성공 |
| 1 | `.env`/`ADMIN_SECRET` 없음, API 오류 |

## 알림 hash

`notifier`는 `app_meta.last_notification_hash`로 중복 메모를 막는다. 경기만 reset하면 hash는 남을 수 있어, **같은 스코어로 admin 테스트를 다시 하면 메모가 안 갈 수 있다.** 사용자가 “메모 재테스트까지 원복”을 요청한 경우에만 DB `app_meta`에서 `last_notification_hash` 키 삭제를 검토한다 (Railway SSH/일회성 스크립트).

## MSYS / Windows

Railway CLI와 별개. `fetch`는 Node 18+ 내장 사용.
