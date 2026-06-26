#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! npx @railway/cli whoami >/dev/null 2>&1; then
  echo "Railway 로그인이 필요합니다:"
  echo "  npx @railway/cli login"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo ".env 파일이 없습니다. KICKOFF_API_KEY, ADMIN_SECRET를 설정하세요."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

for key in KICKOFF_API_KEY ADMIN_SECRET; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing $key in .env"
    exit 1
  fi
done

OPTIONAL_VARS=()
if [[ -n "${KAKAO_REST_API_KEY:-}" ]]; then
  OPTIONAL_VARS+=("KAKAO_REST_API_KEY=${KAKAO_REST_API_KEY}")
fi
if [[ -n "${KAKAO_CLIENT_SECRET:-}" ]]; then
  OPTIONAL_VARS+=("KAKAO_CLIENT_SECRET=${KAKAO_CLIENT_SECRET}")
fi
if [[ -n "${SESSION_SECRET:-}" ]]; then
  OPTIONAL_VARS+=("SESSION_SECRET=${SESSION_SECRET}")
fi
if [[ -n "${TOKEN_ENCRYPTION_KEY:-}" ]]; then
  OPTIONAL_VARS+=("TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}")
fi
if [[ -n "${VAPID_PUBLIC_KEY:-}" ]]; then
  OPTIONAL_VARS+=("VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}")
fi
if [[ -n "${VAPID_PRIVATE_KEY:-}" ]]; then
  OPTIONAL_VARS+=("VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}")
fi
if [[ -n "${VAPID_SUBJECT:-}" ]]; then
  OPTIONAL_VARS+=("VAPID_SUBJECT=${VAPID_SUBJECT}")
fi

echo "==> Railway 프로젝트 연결 (미연결 시 railway init 실행)"
if ! npx @railway/cli status >/dev/null 2>&1; then
  npx @railway/cli init
fi

echo "==> 환경 변수 설정"
MSYS_NO_PATHCONV=1 npx @railway/cli variables set \
  "KICKOFF_API_KEY=${KICKOFF_API_KEY}" \
  "ADMIN_SECRET=${ADMIN_SECRET}" \
  "DATABASE_PATH=/data/app.db" \
  "PORT=3000" \
  "NODE_ENV=production" \
  "${OPTIONAL_VARS[@]}"

if [[ ${#OPTIONAL_VARS[@]} -gt 0 ]]; then
  echo "    (+ Kakao/session/VAPID vars from .env)"
fi

if [[ -n "${BASE_URL:-}" && "${BASE_URL}" != "http://localhost:3000" ]]; then
  MSYS_NO_PATHCONV=1 npx @railway/cli variables set "BASE_URL=${BASE_URL}"
fi

echo ""
echo "==> Volume 확인 (대시보드에서 한 번만)"
echo "    Service → Settings → Volumes → Add Volume"
echo "    Mount path: /data"
echo ""

echo "==> 배포 (railway up)"
npx @railway/cli up --detach

echo ""
echo "배포 후:"
echo "  1. Settings → Networking → Generate Domain"
echo "  2. Deploy 로그에서 fixture 6경기 verified 확인"
echo "  3. BASE_URL을 Railway 도메인으로 맞추려면:"
echo "     npx @railway/cli variables set BASE_URL=https://<your-domain>.up.railway.app"
