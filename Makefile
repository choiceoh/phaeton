.PHONY: dev dev-api dev-ui build clean db db-stop db-reset db-test test test-api test-ui vet

TEST_DATABASE_URL ?= postgres://phaeton:phaeton@localhost:5432/phaeton_test?sslmode=disable

# 개발
dev: dev-api dev-ui

dev-api:
	cd backend && go run ./cmd/server

dev-ui:
	cd frontend && npm run dev

# 빌드
build: build-ui build-api

build-ui:
	cd frontend && npm run build

build-api:
	cd backend && go build -o ../bin/phaeton ./cmd/server

# 정리
clean:
	rm -rf bin/ backend/cmd/server/static/assets

# DB
db:
	docker compose up -d db

db-stop:
	docker compose down

db-reset:
	docker compose down -v && docker compose up -d db

# Create the phaeton_test database. Safe to re-run — does nothing if it already exists.
# Useful when the docker volume already exists from before db-init was added.
db-test:
	docker compose exec -T db psql -U phaeton -d postgres \
		-c "SELECT 'CREATE DATABASE phaeton_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'phaeton_test')\gexec"

# 테스트
test: test-api test-ui

test-api:
	cd backend && TEST_DATABASE_URL='$(TEST_DATABASE_URL)' go test -race -timeout 120s -p 1 ./...

test-ui:
	cd frontend && npm test

vet:
	cd backend && go vet ./...
