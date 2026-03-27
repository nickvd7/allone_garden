# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure
- Core gameplay mechanics
- Multilingual support (English, Dutch)
- Chat system
- Trading system
- Demo version

### Changed
- Nothing yet

### Deprecated
- Nothing yet

### Removed
- Nothing yet

### Fixed
- Nothing yet

### Security
- Nothing yet

## [0.1.0] - 2024-01-15

### Added
- Initial alpha release
- Basic garden management
- Plant growing system
- Weather effects
- Simple multiplayer demo
```

### **7. .gitignore**
```
# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
/coverage

# Production
/build
/dist

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Database
*.sqlite
*.db

# Redis
dump.rdb

# Temporary files
tmp/
temp/
*.tmp

# Build files
*.tgz
*.zip