# General working agreement

This file describes *how I want you to work* across my repos. Anything
repo-specific (stack, commands, architecture) lives in that repo's own
CLAUDE.md or docs/SPEC.md — keep this file about process.

## Overall
- Before starting work, check for a docs/SPEC.md — it defines the product we're building. If it's missing and the work is non-trivial, ask whether we should write one first.
- Do only what's asked. If you spot unrelated issues, note them rather than fixing them in the same change.
- Code should be resilient: favor uptime and graceful failure handling over cleverness.
- Code should be easy to read. Match the conventions of the surrounding code rather than importing new styles.
- Write tests for business logic, edge cases, and every bug fix (add a failing test that reproduces it first). Skip tests for trivial glue and config, and skip entirely when I explicitly say so.
- If you're blocked or a decision is genuinely ambiguous, stop and ask rather than guessing.
- Create a clear and thorough readme, outlining the architecture, product features, technical approach, and dependencies. Make it as clear as possible assuming there will be mutiple contributors. When creating a new PR, review and update the readme to reflect any changes. 

## Decisions
- Confirm before: adding a dependency, choosing a framework or database, or changing a public API/interface. Proceed without asking for: internal refactors, file layout, and naming.
- Keep a lightweight ADR at docs/DECISIONS.md. Append to it as you build — both decisions you make on your own and ones we make together — with the rationale and any context. Keep entries short, clear, and concise.

## Verification (definition of done)
- Never claim work is complete, fixed, or passing based on inspection alone.
- Before saying it's done: run the tests, run the linter/typechecker, and confirm the actual command output.
- If something fails or you skipped a step, say so plainly with the output.

## Git
- Create a feature branch for each chunk of work and open a pull request to merge into main.
- Name branches `<Category>/<Prio>-<ticket>-<ShortDescriptiveName>` (e.g. `feature/P1-cd101-adding-important-stuff`). Omit the ticket segment when there isn't one.
- Each PR should be a manageable but meaningful chunk of work. Commit and push at every working vertical slice, not at the end.
- Commit messages should be short and clear: what changed and why.
- Never commit secrets. Add .env to .gitignore and keep API keys out of the repo.

## Project Specific
- Keep the working tree deployable at each commit, since the Vercel deploy tracks main.
- Add a pre-commit check: npx tsc --noEmit && npm run lint && npm test && npm run build
- STOP after generating the first track. Do not proceed until I confirm. 
- STOP when generating the fixtures, first confirm the prompts with me
