#!/usr/bin/env bash
# ──────────────────────────────────────────────
# live-test.sh — 빌드 후 라이브 스모크 테스트
#
# 사용법:
#   bash scripts/live-test.sh          # 자동 포트 할당
#   bash scripts/live-test.sh 3200     # 수동 포트 지정
#   bash scripts/live-test.sh --dev    # 빌드 없이 dev 모드
# ──────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="${PWD}"
MODE="production"
PORT="${1:-}"

# --dev 모드
if [ "${1:-}" = "--dev" ]; then
  MODE="dev"
  PORT="${2:-}"
fi

# ── 포트 할당 ──────────────────────────────
alloc_port() {
  local base=3100
  local max=3199
  local p=$base
  while [ $p -le $max ]; do
    if ! ss -tlnp 2>/dev/null | grep -q ":$p " && \
       ! lsof -i ":$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo $p
      return
    fi
    p=$((p + 1))
  done
  echo "ERROR: 포트 $base-$max 모두 사용 중" >&2
  exit 1
}

if [ -z "$PORT" ]; then
  PORT=$(alloc_port)
fi

OK="\033[0;32m✓\033[0m"
FAIL="\033[0;31m✗\033[0m"
INFO="\033[0;36mℹ\033[0m"

echo ""
echo "══════════════════════════════════════"
echo "  Phaeton 라이브 테스트 (포트 $PORT)"
echo "══════════════════════════════════════"
echo ""

# ── 빌드 (production 모드만) ───────────────
if [ "$MODE" = "production" ]; then
  echo -e "$INFO 빌드 시작..."
  if npm run build 2>&1 | tail -5; then
    echo -e "$OK 빌드 성공"
  else
    echo -e "$FAIL 빌드 실패"
    exit 1
  fi
fi

# ── 서버 시작 ──────────────────────────────
PID_FILE="/tmp/phaeton-test-$PORT.pid"
LOG_FILE="/tmp/phaeton-test-$PORT.log"

cleanup() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

echo -e "$INFO 서버 시작 (포트 $PORT)..."

if [ "$MODE" = "production" ]; then
  NEXT_PUBLIC_APP_URL="http://localhost:$PORT" \
    npx next start -p "$PORT" > "$LOG_FILE" 2>&1 &
else
  NEXT_PUBLIC_APP_URL="http://localhost:$PORT" \
    npx next dev -p "$PORT" > "$LOG_FILE" 2>&1 &
fi
echo $! > "$PID_FILE"

# ── 서버 준비 대기 ─────────────────────────
echo -e "$INFO 서버 준비 대기..."
READY=false
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT" > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  echo -e "$FAIL 서버 시작 실패 (60초 타임아웃)"
  echo "── 로그 ──"
  tail -20 "$LOG_FILE"
  exit 1
fi
echo -e "$OK 서버 준비 완료 (${i}초)"

# ── 스모크 테스트 ──────────────────────────
BASE="http://localhost:$PORT"
PASS=0
TOTAL=0

check() {
  local name="$1"
  local url="$2"
  local expect_status="${3:-200}"
  TOTAL=$((TOTAL + 1))

  local status
  status=$(curl -sf -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")

  if [ "$status" = "$expect_status" ]; then
    echo -e "  $OK $name (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo -e "  $FAIL $name (HTTP $status, 기대값 $expect_status)"
  fi
}

check_json() {
  local name="$1"
  local url="$2"
  local jq_filter="$3"
  TOTAL=$((TOTAL + 1))

  local body
  body=$(curl -sf "$url" 2>/dev/null || echo "")

  if [ -z "$body" ]; then
    echo -e "  $FAIL $name (응답 없음)"
    return
  fi

  local result
  result=$(echo "$body" | jq -r "$jq_filter" 2>/dev/null || echo "")

  if [ -n "$result" ] && [ "$result" != "null" ]; then
    echo -e "  $OK $name → $result"
    PASS=$((PASS + 1))
  else
    echo -e "  $FAIL $name (JSON 파싱 실패)"
  fi
}

echo ""
echo "── 기본 응답 ──"
check "프론트 페이지"       "$BASE/"
check "Payload Admin"       "$BASE/admin" "302"

echo ""
echo "── 헬스체크 ──"
check_json "GET /api/health" "$BASE/api/health" ".status"

echo ""
echo "── API 엔드포인트 ──"
check "GET /api/phaeton/summary"        "$BASE/api/phaeton/summary"
check "GET /api/phaeton/project-status" "$BASE/api/phaeton/project-status"
check "GET /api/phaeton/staff-load"     "$BASE/api/phaeton/staff-load"
check "GET /api/phaeton/overdue"        "$BASE/api/phaeton/overdue"

echo ""
echo "── 대시보드 페이지 ──"
check "대시보드"   "$BASE/dashboard"
check "프로젝트"   "$BASE/projects"
check "인력"       "$BASE/staff"
check "알림"       "$BASE/alerts"

# ── 결과 ───────────────────────────────────
echo ""
echo "══════════════════════════════════════"
if [ "$PASS" -eq "$TOTAL" ]; then
  echo -e "  $OK 전체 통과: $PASS/$TOTAL"
else
  echo -e "  $FAIL 결과: $PASS/$TOTAL 통과"
fi
echo "  포트: $PORT | 모드: $MODE"
echo "══════════════════════════════════════"
echo ""

# JSON 결과 출력 (에이전트가 파싱 가능)
cat <<RESULT_JSON
{"passed":$PASS,"total":$TOTAL,"port":$PORT,"mode":"$MODE"}
RESULT_JSON

[ "$PASS" -eq "$TOTAL" ]
