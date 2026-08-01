# Contributing to Pulse

Thank you for your interest in contributing to Pulse! This guide covers how to get set up, make changes, and open a pull request.

## Code of conduct

Be respectful and constructive. We're all here to build something useful.

## Getting started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:

   ```sh
   git clone https://github.com/<your-username>/Pulse.git
   cd Pulse
   ```

3. **Install dependencies**:

   ```sh
   pnpm install
   ```

4. **Set up environment files** (see [README](README.md#quick-start-developers)).

5. **Start the services** you need:

   ```sh
   pnpm --filter api dev
   pnpm --filter desktop dev   # optional
   pnpm --filter mobile dev    # optional
   ```

## Development workflow

### Branch naming

Use descriptive branch names:

- `feat/add-export-csv`
- `fix/timer-sync-on-resume`
- `docs/self-hosting-nginx`

### Making changes

- Match existing code style and patterns in the file you're editing.
- Keep changes focused — one logical change per pull request when possible.
- Run lint and type checks before opening a PR:

  ```sh
  pnpm lint
  pnpm check-types
  ```

### Shared packages

Business logic that is used by more than one app belongs in `packages/`:

- `packages/types` — TypeScript interfaces
- `packages/validation` — Zod schemas (API contracts)
- `packages/utils` — Pure utilities (timer math, formatting)
- `packages/queries` — React Query hooks
- `packages/api-client` — HTTP client and token handling

### Timer and sync rules

When touching timer or sync code, keep these principles in mind:

1. The timer **runs locally** — never sync every second.
2. Only **completed sessions** are sent to the server (on pause).
3. Socket.IO carries **small events** (start, pause, goal updates), not continuous streams.
4. Everything must work **offline**; sync when connectivity returns.

See [Architecture](docs/high_level_architecture.md) for the full design rationale.

## Pull requests

1. Push your branch to your fork.
2. Open a pull request against `main` on the upstream repository.
3. Fill in the PR description:
   - What changed and why
   - How you tested it
   - Screenshots for UI changes (desktop and/or mobile)
4. Make sure CI checks pass (if configured).
5. Address review feedback promptly.

### PR checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm check-types` passes
- [ ] Tested on the platform(s) affected (desktop, mobile, API)
- [ ] Updated docs if behavior or setup changed
- [ ] No secrets or `.env` files committed

## Reporting bugs

Open a [GitHub issue](https://github.com/mohammad-naimur-rahman/Pulse/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- Platform (Windows desktop / Android / API version)
- Relevant logs or screenshots

## Feature requests

Open an issue describing the feature, the problem it solves, and any alternatives you considered. Discussion before large PRs helps avoid wasted effort.

## Self-hosting contributions

Improvements to [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md), Docker setup, and deployment scripts are especially welcome.

## Questions

Open a GitHub issue with the `question` label, or start a discussion in the repository.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
