.PHONY: dev build test test-go test-frontend lint lint-go lint-frontend format vet tidy clean coverage audit audit-go audit-frontend analyze-bundle help

# Default target
.DEFAULT_GOAL := help

# Variables
GO := go
WAILS := wails
PNPM := pnpm
UI_DIR := ui
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -X main.Version=$(VERSION) -X main.Commit=$(COMMIT) -X main.BuildDate=$(BUILD_DATE)

## dev: Start development server with hot reload
dev:
	$(WAILS) dev

## build: Build production binary with version metadata
build:
	$(WAILS) build -ldflags "$(LDFLAGS)"

## test: Run all tests
test: test-go test-frontend

## test-go: Run Go tests
test-go:
	$(GO) test ./... -v -race

## test-frontend: Run frontend tests
test-frontend:
	cd $(UI_DIR) && $(PNPM) run test --run

## lint: Run all linters
lint: lint-go lint-frontend

## lint-go: Run Go linters
lint-go:
	golangci-lint run ./...

## lint-frontend: Run frontend linters
lint-frontend:
	cd $(UI_DIR) && $(PNPM) exec eslint src/

## format: Format all code
format:
	$(GO) fmt ./...
	cd $(UI_DIR) && $(PNPM) exec prettier --write "src/**/*.{ts,tsx,css}" 2>/dev/null || true

## vet: Run Go vet
vet:
	$(GO) vet ./...

## tidy: Tidy Go modules
tidy:
	$(GO) mod tidy

## coverage: Run frontend tests with coverage report
coverage:
	cd $(UI_DIR) && $(PNPM) run test --run --coverage

## audit: Run dependency security audits
audit: audit-go audit-frontend

## audit-go: Audit Go dependencies
audit-go:
	$(GO) list -json -m all | docker run --rm -i sonatypecommunity/nancy:latest sleuth 2>/dev/null || echo "Install nancy for Go dependency audit"

## audit-frontend: Audit frontend dependencies
audit-frontend:
	cd $(UI_DIR) && pnpm audit --prod 2>/dev/null || echo "Run 'pnpm audit' for details"

## analyze-bundle: Analyze frontend bundle size
analyze-bundle:
	cd $(UI_DIR) && pnpm run build && du -sh dist/ && echo "---" && find dist/assets -name '*.js' -o -name '*.css' | xargs ls -lhS

## clean: Remove build artifacts
clean:
	rm -rf build/bin
	rm -rf $(UI_DIR)/dist
	rm -rf $(UI_DIR)/node_modules/.vite

## help: Show this help message
help:
	@echo "Available targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /' | sort
