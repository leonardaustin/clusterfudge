# Contributing to Clusterfudge

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. Install prerequisites (see [README.md](README.md#prerequisites))
2. Fork and clone the repository
3. Install frontend dependencies: `cd ui && pnpm install`
4. Start the dev server: `make dev`

## Making Changes

1. Create a branch from `main` for your work
2. Make your changes
3. Run tests and linters before submitting:
   ```bash
   make test
   make lint
   ```
4. Open a pull request against `main`

## Pull Request Guidelines

- Keep PRs focused &mdash; one feature or fix per PR
- Include tests for new functionality
- Update documentation if behavior changes
- Ensure CI passes before requesting review

## Code Style

- **Go:** Follow standard Go conventions. Run `make lint` (uses golangci-lint)
- **TypeScript/React:** Follow the existing ESLint configuration. Run `make lint-frontend`
- **Commits:** Use clear, descriptive commit messages

## Reporting Issues

Open an issue with:
- A clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Your environment (OS, Go version, Node version)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
