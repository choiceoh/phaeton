#!/usr/bin/env bash
# 세션 시작 시 개발 환경 상태 점검 (worktree 호환)
set -euo pipefail

# worktree에서 실행될 수 있으므로 원본 프로젝트 루트와 현재 CWD 모두 고려
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_ROOT="${PWD}"

# worktree인지 판별
IS_WORKTREE=false
if [ "$WORK_ROOT" != "$MAIN_ROOT" ] && [ -f "$WORK_ROOT/package.json" ]; then
  IS_WORKTREE=true
fi

OK="\033[0;32m✓\033[0m"
WARN="\033[0;33m!\033[0m"
FAIL="\033[0;31m✗\033[0m"
INFO="\033[0;36mℹ\033[0m"

echo "── Phaeton 개발 환경 점검 ──"
if [ "$IS_WORKTREE" = true ]; then
  echo -e "$INFO worktree 감지: $WORK_ROOT"
fi

# 1. node_modules 확인 (symlink 또는 실제 디렉토리)
if [ -d "$WORK_ROOT/node_modules" ]; then
  if [ -L "$WORK_ROOT/node_modules" ]; then
    echo -e "$OK node_modules (symlink → 메인)"
  else
    echo -e "$OK node_modules 존재"
  fi
else
  echo -e "$WARN node_modules 없음 → npm install 실행"
  cd "$WORK_ROOT" && npm install --prefer-offline 2>/dev/null || npm install
fi

# 2. .env 확인
if [ -f "$WORK_ROOT/.env" ]; then
  echo -e "$OK .env 파일 존재"
elif [ -f "$MAIN_ROOT/.env" ]; then
  cp "$MAIN_ROOT/.env" "$WORK_ROOT/.env"
  echo -e "$WARN .env → 메인에서 복사"
elif [ -f "$WORK_ROOT/.env.example" ]; then
  cp "$WORK_ROOT/.env.example" "$WORK_ROOT/.env"
  echo -e "$WARN .env → .env.example에서 복사. 값 확인 필요"
fi

# 3. DB 컨테이너 확인 (메인 루트의 docker-compose.dev.yml 사용)
COMPOSE_FILE="$MAIN_ROOT/docker-compose.dev.yml"
if [ -f "$COMPOSE_FILE" ]; then
  if docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q db; then
    echo -e "$OK PostgreSQL 컨테이너 실행 중"
  else
    echo -e "$WARN DB 컨테이너 미실행 → 시작"
    docker compose -f "$COMPOSE_FILE" up -d 2>/dev/null
  fi
fi

# 4. DB 연결 확인
if pg_isready -h localhost -p 5432 -U phaeton -q 2>/dev/null; then
  echo -e "$OK PostgreSQL 연결 가능"
elif [ -f "$COMPOSE_FILE" ] && docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U phaeton -q 2>/dev/null; then
  echo -e "$OK PostgreSQL 연결 가능 (via container)"
else
  echo -e "$FAIL PostgreSQL 연결 불가"
fi

echo "── 점검 완료 ──"
