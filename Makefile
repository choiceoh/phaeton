.PHONY: dev dev-api dev-ui build clean db db-stop

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
