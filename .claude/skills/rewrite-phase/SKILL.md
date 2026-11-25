---
name: rewrite-phase
description: Deliver one phase of the ha-chauffage rewrite (docs/rewrite-plan.md) on the `rewrite` branch, from the branch to the merge, without the owner. Use it when the user types `/rewrite-phase <phase>`, for example `/rewrite-phase I3` or `/rewrite-phase first-step`, or asks a session to do a phase of the rewrite plan.
---

# Deliver a phase of the rewrite

You deliver one phase of [docs/rewrite-plan.md](../../../docs/rewrite-plan.md), alone, from the
branch to the merge into `rewrite`. The owner doesn't read the code. The owner only decides the
behavior rules and the design. So the tests and a scoped review protect the code, and you stop
as soon as a decision belongs to the owner.

The argument names the phase: `first-step`, `0`, `I1` to `I7`, or `C0` to `C6`.

## The rules of every phase

- **Do only this phase.** Something wrong outside the phase goes in the pull request, under
  *Left for later*. Don't fix it.
- **Change the structure, not the behavior.** Only the first step changes behavior: its item 4
  applies the simplified rules of section 6 of the plan. Phase I6 adds a websocket command, and
  phase C5 uses it.
- **Aim for simple code and simple rules.** Delete before you add. Add no option, no flag and no
  mode. Use the words of [docs/glossary.md](../../../docs/glossary.md).
- **Never merge into `main`**, and never use `gh pr merge --auto`: on this repository it merges
  at once, before the CI.
- **Follow CONTRIBUTING.md**, especially its *Conventions*. Write the code, the commits and the
  pull request in English.

## 1. Check that you can test

Run `scripts/test.sh js`. If the tests can't run, for example because Docker is stopped and Node
is missing, stop and tell the owner. A phase without tests can't prove that the behavior stays.

The card phases (C0 to C6) also need the development HA (`docker compose -f dev/compose.yaml up
-d`) for the review in step 6.

## 2. Read before you write

1. Read the section of the phase in the plan, the decisions of the owner at the top of the plan,
   and the *How a phase is delivered* section.
2. Read the sections of [docs/decisions.md](../../../docs/decisions.md) that cover the code you
   move.
3. Read issue #132, to see which phases are done.

If the plan contradicts the code, or misses a decision you need, stop and ask the owner.

## 3. Branch from `rewrite`

```bash
git fetch origin
git switch -c rewrite/<phase>-<short-name> origin/rewrite
```

If `origin/main` has commits that `rewrite` doesn't have, first merge `origin/main` into
`rewrite`, with the tests green, and push `rewrite`. A conflict on rewritten code keeps the code
of `rewrite`: the regression test of the fix carries the fix, and the code of `rewrite` must pass
it.

## 4. Work test first

- **Code you move.** The existing tests are the specification. Don't edit a test to make it
  pass. Only the tests that the plan lists as testing internals get rewritten. Break the code on
  purpose and see each rewritten test fail.
- **A missing test.** Before you move an edge case without a test, write the test on the code
  before the move, and see it pass.
- **A new behavior** (the first step, the preview command of I6): write the test first, and see
  it fail for the expected reason.

Commit in small steps, with short English messages.

## 5. Stop when a decision belongs to the owner

Stop, and present the case to the owner with the `simplify-behavior-rules` skill, when:

- a test fails, and only a change of behavior would make it pass;
- a fix would add a rule, a flag, an exception or a stored state;
- two decisions of the owner contradict each other in the code.

Never guess what the owner would choose. Write in French, with "tu", with a scenario, the
behavior before and after, and an example with real values.

## 6. Check the whole phase

1. Run `scripts/test.sh`, then `scripts/test.sh coverage`. Both must pass.
2. For a card phase, review the card in the development HA with
   [dev/review/](../../../dev/review/README.md), on every kind of thermostat and at 360 px wide.
   Take the same screenshots on `origin/rewrite` and on your branch, and compare them. Open the
   screenshots: a row can measure right and still look wrong.
3. Update the docs that the phase changes, for example `CONTRIBUTING.md` and
   `CONTRIBUTING.fr.md` in the same commit.

## 7. Open the pull request against `rewrite`

```bash
gh pr create --base rewrite --title "Rewrite <phase>: <what it does>"
```

Write the description in the structured style of
[docs/writing-style.md](../../../docs/writing-style.md):

- **What moved**, in a few lines.
- **Size**: the lines added and removed, from `git diff --shortstat origin/rewrite...HEAD`.
- **Concepts**: the types, flags, options or stored states that the phase adds or removes. A
  phase that adds more than it removes says why.
- **Left for later**: what you saw outside the phase.
- `Refs #132`.

Wait for a green CI. Fix a red CI with the rules of step 4.

## 8. Get a scoped review

Start a fresh agent, not a fork, so that the review is not anchored on your reasoning. Give the
agent the diff (`gh pr diff <number>`), the section of the phase in the plan, and the paths of
`docs/decisions.md` and `docs/glossary.md`. Don't give it your conclusions.

Give the agent this brief, word for word:

> Review this phase of a rewrite that must keep the behavior. Report only three kinds of
> findings:
>
> 1. **A regression**: the behavior differs from the base branch. Prove it with a test that
>    passes on the base branch and fails on this one. Without such a test, don't report it.
> 2. **A breach of a design decision**: the code contradicts `docs/decisions.md`, the glossary
>    or the plan. Quote the decision.
> 3. **Needless complexity**: a branch, a flag, a type or a state that the code can do without.
>    Say what to remove.
>
> Don't suggest new cases to handle, new checks, new error handling or new options. Return at
> most 8 findings, the most severe first, or none.

## 9. Handle the findings

- **A proved regression**: restore the behavior of the base branch, and keep the test.
- **A breach of a design decision**: follow the decision.
- **Needless complexity**: remove it.
- **A fix that would add a rule, a flag or a stored state**: don't apply it. Go to step 5.
- **Anything else**: put it under *Left for later*, or drop it.

Push, and wait for a green CI again. Don't ask for a second review, unless your fixes changed
more than the findings asked.

## 10. Merge into `rewrite`

```bash
gh pr merge <number> --merge --match-head-commit <sha of the head commit>
```

Then tick the phase in issue #132.

## 11. Report to the owner

Report in French, with "tu", in a few short paragraphs:

- what the phase moved, and the size of the change;
- the concepts added and removed;
- what you left for later;
- the next phase, according to the order of the plan.
