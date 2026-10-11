# Instructions for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. It covers the dev setup, testing and deployment, and its **Conventions** section applies to every contribution.

Key rules, in short:
- Tests first (TDD): the test of a behavior or a bug is written, and seen failing, before the code; every use case has a test (docs/use-cases.md).
- Write code in English: identifiers, comments, specs and tests.
- Use the vocabulary of docs/glossary.md (schedule, preset, slot, override), not "mode" or "level" (stored data and websocket API keep them until the renaming step).
- Write commit messages in English.
- English docs (`README.md`, `CONTRIBUTING.md`) are canonical. Update the `*.fr.md` version in the same commit.
