.DEFAULT_GOAL := help
.PHONY: help install up down logs restart migrate migrate-reset seed test test-e2e lint typecheck build clean fresh

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies
	pnpm install

up: ## Start postgres + redis + minio + api + web via docker-compose
	docker compose up -d --build
	@echo ""
	@echo "  API:    http://localhost:4000/api/v1/health"
	@echo "  Web:    http://localhost:3000"
	@echo "  Docs:   http://localhost:4000/api/v1/docs"
	@echo "  MinIO:  http://localhost:9001 (admin / minio-admin-password)"

down: ## Stop all services
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f --tail=100

restart: down up ## Restart everything

migrate: ## Apply pending Prisma migrations
	pnpm --filter @logisti-core/api db:migrate

migrate-reset: ## Reset DB and re-apply migrations (destroys data)
	pnpm --filter @logisti-core/api db:migrate-reset

seed: ## Seed demo data
	pnpm --filter @logisti-core/api db:seed

test: ## Run all unit tests
	pnpm test

test-e2e: ## Run API e2e tests
	pnpm test:e2e

lint: ## Lint all packages
	pnpm lint

typecheck: ## Typecheck all packages
	pnpm typecheck

build: ## Build api + web
	pnpm build

clean: ## Remove build artifacts and node_modules
	pnpm clean

fresh: clean install migrate-reset seed ## Nuclear: clean → install → reset DB → seed
