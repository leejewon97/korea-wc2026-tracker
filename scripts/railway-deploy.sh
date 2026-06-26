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

echo "==> Railway 프로젝트 연결 (미연결 시 railway init 실행)"
if ! npx @railway/cli status >/dev/null 2>&1; then
  npx @railway/cli init
fi

echo "==> 환경 변수 설정"
npx @railway/cli variables set \
  "KICKOFF_API_KEY=${KICKOFF_API_KEY}" \
  "ADMIN_SECRET=${ADMIN_SECRET}" \
  "DATABASE_PATH=/data/app.db" \
  "PORT=3000" \
  "NODE_ENV=production"

if [[ -n "${BASE_URL:-}" ]]; then
  npx @railway/cli variables set "BASE_URL=${BASE_URL}"
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
