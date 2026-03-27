# Contributing to Garden Paradise

## Welcome! 🌱

Thank you for considering contributing to Garden Paradise! We're excited to have you join our community.

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you agree to uphold this code. Please report unacceptable behavior to hello@garden-paradise.org.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- Clear and descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (OS, browser, Node version)

**Bug Report Template:**
```
**Describe the bug**
A clear description of the bug.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g. Ubuntu 22.04]
 - Browser: [e.g. Chrome 120]
 - Node Version: [e.g. 18.17.0]
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- Clear and descriptive title
- Detailed description of proposed functionality
- Why this enhancement would be useful
- Possible implementation approaches

### Pull Requests

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

**Pull Request Guidelines:**

- Follow the existing code style
- Write meaningful commit messages
- Update documentation as needed
- Add tests for new features
- Ensure all tests pass
- Update CHANGELOG.md

## Development Process

### Setting Up Development Environment
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/garden-paradise.git
cd garden-paradise

# Add upstream remote
git remote add upstream https://github.com/original/garden-paradise.git

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start development server
npm run dev
```

### Code Style

We use ESLint and Prettier for code formatting.
```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples:**
```
feat(plants): add sunflower plant type
fix(trading): resolve duplication bug in trade confirmation
docs(readme): update installation instructions
```

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test updates

Examples:
- `feature/add-sunflowers`
- `fix/trading-bug`
- `docs/update-api-guide`

## Plugin Development

See [PLUGINS.md](docs/PLUGINS.md) for detailed guide on creating plugins.

### Plugin Checklist

- [ ] Plugin follows naming convention
- [ ] Includes README.md
- [ ] Has proper error handling
- [ ] Includes tests
- [ ] Documentation is complete
- [ ] No security vulnerabilities

## Translation Contributions

Help translate Garden Paradise to your language!

1. Copy `frontend/src/i18n/locales/en.json`
2. Rename to your language code (e.g., `fr.json` for French)
3. Translate all strings
4. Register in `frontend/src/i18n/config.js`
5. Test thoroughly
6. Submit PR

## Community

- Join our [Discord](https://discord.gg/placeholder)
- Follow us on [Twitter](https://twitter.com/placeholder)
- Read our [Blog](https://blog.garden-paradise.org)

## Recognition

Contributors are recognized in:
- README.md Contributors section
- CHANGELOG.md for each release
- Annual Contributors Award

## Questions?

Feel free to ask questions in:
- GitHub Discussions
- Discord #dev-chat channel
- Email: dev@garden-paradise.org

Thank you for contributing! 🌱