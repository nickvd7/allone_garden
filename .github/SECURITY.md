# Security Policy

## Supported versions

Security fixes are applied to the `main` branch. Self-hosters should keep their
install up to date with the latest `main` (or a tagged release when available).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately to: **hello@garden-paradise.org**

Include:

- A short description of the issue
- Steps to reproduce (or a proof of concept)
- Affected component (backend, frontend, install scripts, etc.)
- Whether you plan to disclose publicly and on what timeline

We aim to acknowledge reports within a few days and to ship a fix or mitigation
before any coordinated disclosure.

## Scope

In scope: authentication, authorization, injection, SSRF, secret exposure in
the repository or default configs, privilege escalation in the game server.

Out of scope: denial-of-service against a single self-hosted instance, social
engineering, and issues that only affect outdated forks.
