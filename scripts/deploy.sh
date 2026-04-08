#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
SLOT_FILE=".deploy-slot"
LOCK_FILE=".deploy-lock"
MAX_WAIT=120

usage() {
  echo "Usage: $0 [--rollback | --status]"
  echo ""
  echo "  (no args)   Blue-Green 무중단 배포"
  echo "  --rollback  이전 슬롯으로 즉시 롤백 (이미지 재빌드 없음)"
  echo "  --status    현재 배포 상태 확인"
  exit 0
}

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local PID
    PID=$(cat "$LOCK_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "[deploy] Another deploy is running (PID: $PID)"
      exit 1
    fi
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
}

get_slots() {
  if [[ -f "$SLOT_FILE" ]]; then
    ACTIVE=$(cat "$SLOT_FILE")
  else
    ACTIVE=""
  fi

  case "$ACTIVE" in
    blue)  NEW=green; OLD=blue ;;
    green) NEW=blue;  OLD=green ;;
    *)     NEW=blue;  OLD="" ;;
  esac
}

wait_healthy() {
  local SERVICE=$1
  local WAITED=0

  while [[ $WAITED -lt $MAX_WAIT ]]; do
    local CID
    CID=$($COMPOSE ps -q "$SERVICE" 2>/dev/null || true)
    if [[ -z "$CID" ]]; then
      sleep 3
      WAITED=$((WAITED + 3))
      continue
    fi

    local STATUS
    STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' \
      "$CID" 2>/dev/null || echo "starting")

    if [[ "$STATUS" == "healthy" ]]; then
      echo "[deploy] $SERVICE: healthy"
      return 0
    fi

    sleep 3
    WAITED=$((WAITED + 3))
    echo "[deploy]   $SERVICE: $STATUS (${WAITED}/${MAX_WAIT}s)"
  done

  echo "[deploy] FAIL: $SERVICE did not become healthy in ${MAX_WAIT}s"
  return 1
}

cmd_status() {
  get_slots
  echo "[deploy] Active slot: ${ACTIVE:-none}"
  $COMPOSE ps
}

cmd_rollback() {
  acquire_lock
  get_slots

  if [[ -z "$OLD" ]]; then
    echo "[deploy] No previous slot to rollback to"
    exit 1
  fi

  echo "[deploy] Rollback: $ACTIVE -> $OLD"
  $COMPOSE start "app-$OLD"

  if ! wait_healthy "app-$OLD"; then
    echo "[deploy] Rollback failed: app-$OLD not healthy"
    $COMPOSE stop "app-$OLD"
    exit 1
  fi

  $COMPOSE stop -t 30 "app-$ACTIVE"
  echo "$OLD" > "$SLOT_FILE"
  echo "[deploy] Rollback complete. Active: app-$OLD"
}

cmd_deploy() {
  acquire_lock
  get_slots

  echo "[deploy] ${OLD:-initial} -> $NEW"

  echo "[deploy] Building image..."
  $COMPOSE build "app-$NEW"

  echo "[deploy] Starting infrastructure..."
  $COMPOSE up -d db caddy

  echo "[deploy] Starting app-$NEW..."
  $COMPOSE up -d "app-$NEW"

  if ! wait_healthy "app-$NEW"; then
    echo "[deploy] Stopping failed app-$NEW..."
    $COMPOSE stop "app-$NEW"
    exit 1
  fi

  if [[ -n "$OLD" ]]; then
    echo "[deploy] Stopping app-$OLD (30s grace)..."
    $COMPOSE stop -t 30 "app-$OLD"
  fi

  echo "$NEW" > "$SLOT_FILE"
  echo "[deploy] Done. Active: app-$NEW"
}

case "${1:-}" in
  --rollback) cmd_rollback ;;
  --status)   cmd_status ;;
  --help|-h)  usage ;;
  "")         cmd_deploy ;;
  *)          usage ;;
esac
