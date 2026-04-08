#!/bin/sh
set -e

# DB 마이그레이션 실행 (테이블 생성/업데이트)
node --experimental-strip-types --experimental-transform-types --no-warnings \
  ./node_modules/payload/bin.js --disable-transpile migrate

# Next.js 서버 시작
exec npm start -- "$@"
