# Contributing

Thanks for your interest in CrowdClip. The project is still evolving, so an
issue describing the proposed change is useful before starting substantial
work.

## Development workflow

1. Fork the repository and create a focused branch.
2. Follow the setup instructions in [`README.md`](README.md).
3. Add or update tests for behavioral changes.
4. Run `pnpm format:check`, `pnpm lint`,
   `pnpm test --runInBand --watchman=false`, and `pnpm build` before opening
   a pull request.
5. Explain the motivation, implementation, and manual verification in the pull
   request description.

Database changes should be additive Supabase migrations; do not edit migrations
that may already have been applied. Never include real user media, access
tokens, service-role keys, webhook secrets, or `.env` files in issues, tests,
fixtures, or commits.

By contributing, you agree that your contributions will be licensed under the
Apache License, Version 2.0.
