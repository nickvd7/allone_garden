# Contributing to AllOne Garden

## Welcome! 🌱

Thank you for considering contributing to AllOne Garden! We're excited to have you join our community.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating you agree to uphold this code. Please report unacceptable behaviour via a [GitHub issue](https://github.com/nickvd7/allone_garden/issues).

## How Can I Contribute?

### Reporting Bugs

Before opening a bug report, please search [existing issues](https://github.com/nickvd7/allone_garden/issues). When creating a report, include:

- Clear and descriptive title
- Steps to reproduce
- Expected vs. actual behaviour
- Screenshots if applicable
- Your environment (OS, browser, Node version)

**Bug Report Template:**
```
**Describe the bug**
A clear description of the bug.

**To Reproduce**
1. Go to '...'
2. Click on '....'
3. See error

**Expected behaviour**
What you expected to happen.

**Environment**
- OS: [e.g. Ubuntu 24.04]
- Browser: [e.g. Chrome 124]
- Node version: [e.g. 20.12.0]
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Include:

- Clear and descriptive title
- Detailed description of the proposed functionality
- Why this would be useful
- Possible implementation approaches

### Pull Requests

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Push the branch (`git push origin feature/my-feature`)
5. Open a Pull Request against `main`

**PR Guidelines:**

- Follow the existing code style
- Write meaningful commit messages
- Update documentation as needed
- Add tests for new features (run offline with `cd packages/backend && npm test`)
- Ensure all tests pass before opening the PR
- Update `CHANGELOG.md` under `[Unreleased]`

## Development Setup

**Short path (English + Dutch):** [docs/QUICK_START.md](docs/QUICK_START.md) — clone, `bash start.sh`, first edits, tests. Steam is optional and **off by default** (`npm run steam:disable` if you need to turn it off).

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/allone_garden.git
cd allone_garden

# Add upstream remote
git remote add upstream https://github.com/nickvd7/allone_garden.git

# Install all dependencies
npm install
cd packages/backend  && npm install && cd ../..
cd packages/frontend && npm install && cd ../..

# Copy env file
cp packages/backend/.env.example packages/backend/.env

# Start backend (port 5000)
cd packages/backend && npm run dev

# Start frontend (port 3000 — separate terminal)
cd packages/frontend && npm start
```

No PostgreSQL or Redis required for local development — the backend runs in in-memory mode when `DATABASE_URL` is empty.

## Testing

```bash
# Run all backend tests (in-memory mode, no DB needed)
cd packages/backend && npm test

# Run tests in watch mode
cd packages/backend && npm run test:watch
```

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

**Types:** `feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore`

**Examples:**
```
feat(garden): add sunflower plant type
fix(trade): resolve duplication bug in trade confirmation
docs(readme): update installation instructions
test(auth): add password-reset integration tests
```

## Branch Naming

- `feature/` — new features
- `fix/` — bug fixes
- `docs/` — documentation updates
- `refactor/` — code refactoring
- `test/` — test additions or updates

## Plugin Development

Plugins live in `plugins/community/`. Each plugin is a directory with an `index.js` and a `manifest.json`.

**Plugin Checklist:**

- [ ] Follows naming convention (`kebab-case`)
- [ ] Includes `README.md` and `manifest.json`
- [ ] Has proper error handling
- [ ] Includes tests
- [ ] No security vulnerabilities (plugins run in a VM sandbox)

## Translations

Help translate AllOne Garden!

1. Copy `packages/frontend/src/i18n/en.json`
2. Rename to your language code (e.g. `fr.json`)
3. Translate all strings
4. Register the locale in `packages/frontend/src/i18n/config.js` (and add Gradendex bundles/overrides if applicable; see `docs/NATIVE_REVIEW.md`)
5. Submit a PR

## Questions?

Open a [GitHub Discussion](https://github.com/nickvd7/allone_garden/discussions) or a [GitHub Issue](https://github.com/nickvd7/allone_garden/issues).

Thank you for contributing! 🌍
