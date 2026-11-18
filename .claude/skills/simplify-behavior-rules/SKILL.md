---
name: simplify-behavior-rules
description: >-
  Replace piled-up special cases in ha-chauffage's behavior (what Chauffage reads from a
  thermostat, what it sends, when an override starts or ends) with a few rules the owner
  validates. Use it whenever a bug report or an exploratory test shows a behavior that looks
  wrong, before you fix it; whenever a fix you are about to write adds a deduction, an
  exception, a flag or a stored state ("if the HVAC mode changed in the same state, ignore
  the setpoint", "remember the override before off"); when a review finds that a fix broke
  another case; and when the owner asks to review, clean up or simplify decisions or behavior
  rules. This is about concepts, not code quality: for refactoring the code, use the built-in
  `simplify` skill instead.
---

# Simplify behavior rules

A fix that guesses what a person meant from a change of state is a **deduction**. Each
deduction fixes one case and opens new ones. On PR #97, four fixes each added a deduction, and
two of them broke at the next review. Replacing them with two rules removed 70 lines from the
integration and lost no wanted use case.

## When to stop

Stop before you code a fix as soon as you see one of these signals:

- the fix needs a hidden stored state, for example `before_off`, which kept the override from
  before off;
- the fix adds an `if` on a combination of states, with a comment that explains the
  combination;
- a review finds a case that a previous fix created.

Then ask: **which existing rule covers this case?** If one does, apply that rule and stop
there. For a single bug, this quick exit is usually enough. Go through the steps below only
when no rule covers the case, or when the deductions have piled up.

**When an odd case shows up, first ask why it exists.** Don't try a one-line tweak to see what
happens. On PR #97, Claude changed RESUME to None for a thermostat without an override, and 3
tests broke. Claude also proposed 3 options to fix a contradiction that its own rule had
created. Neither was asked for.

## 1. State the principle in plain words

Write what the slot controls, then the rules that follow, in two or three sentences. Give one
concrete example. Aim for rules with no exception.

Base the rules on what the slot controls and on what the device shows, never on what a person
meant. A rule based on an intent invites deductions. On PR #97, a proposal put into the
override properties that the slot does not set, and the owner rejected it.

Example, from `docs/decisions.md`, "A change by hand":

> A slot controls an HVAC mode and, in heat or cool, a setpoint.
> 1. A change by hand of what the slot controls changes the override on that point. The
>    override takes what the thermostat shows, so Chauffage sends nothing.
> 2. When the thermostat is back to the slot's HVAC mode and setpoint, the schedule resumes.
>
> Example: the slot asks Heat at 19 °C. You set 21 °C on the thermostat. The override becomes
> 21 °C. You set 19 °C again, and the schedule resumes.

If you can't state the principle in plain words, you don't understand the feature yet. Read
`docs/decisions.md` and the code before going further.

## 2. Cross-check the rules

For each rule, ask: **what is this rule for?** Look for a rule that follows from another one,
and merge the two. On PR #97, "Chauffage sends nothing after a change by hand" followed from
"the override takes what the thermostat shows". The owner asked what the third rule was for,
and 3 rules became 2.

Hunt for the words "unless", "except" and "when… then". Each one hides an exception. Remove it,
or make it a rule of its own.

## 3. List the deductions and exceptions

Search the code of the feature for what the principle does not need. Look for:

- a stored state that remembers the past, for example `before_off`;
- a branch that reads one change differently depending on another, for example "a setpoint
  shown with a new HVAC mode is ignored";
- a value sent to the thermostat that nobody asked for, for example the slot's value sent in
  the new HVAC mode.

For each item, ask which rule of the principle already covers the case. Write the answer next
to the item. An item that no rule covers is either a missing rule, to propose in step 6, or a
case to drop.

## 4. Remove before you add

Remove the deductions first, in their own commit, with their tests and their docs. Keep what is
not a deduction, and say so in the commit message. On PR #97, the refusals of
`chauffage.set_override` and the short HVAC mode names in labels stayed.

Then code the principle. Never add a guard to a deduction to fix it.

## 5. Run the existing tests unchanged

Run `scripts/test.sh integration` (and `scripts/test.sh js` if the card is involved) without
editing a single test. The failing tests are **the list of behaviors that change**. Don't fix
them yet.

For each failing test, write down the scenario, the old behavior and the new behavior. Group
the tests that fail for the same reason.

## 6. Get the owner's OK, in plain French

Present the list to the owner in French, before you touch the tests. For each behavior that
changes, give:

- the scenario, as a person in the room would live it;
- before: what Chauffage did;
- after: what Chauffage does now;
- one example with real values.

Example:

> **Tu éteins le thermostat à la main pendant une dérogation à 21 °C, puis tu le rallumes.**
> Avant : Chauffage redonnait la dérogation à 21 °C, jusqu'à sa fin.
> Après : la dérogation prend ce que le thermostat affiche. S'il affiche la consigne du
> créneau, 19 °C, le planning reprend.

Wait for an explicit OK on each change. If the owner refuses one, change the principle, not the
test, and go back to step 1.

## 7. Keep your own rules apart from the owner's

Each time you write a rule, ask: did the owner say this, or did I? Mark your own rules as
proposals, in the chat and in `docs/decisions.md`. Write "the owner" only for a choice the owner
made.

Example of a rule that slipped in on PR #97: "a mode change reads only the mode". Nobody had
asked for it. The owner challenged it and it was dropped.

## 8. Check every claim before you write it

Before you write a sentence about devices or people, ask: **is it a fact? Which device does
that?** If you can't name a source or a device, drop the sentence, or write it as a question.

Examples of guesses written as facts on PR #97, both dropped:

- "a gesture rarely changes both";
- "some devices show no setpoint when off".

## 9. Update the tests and the docs

Once the owner has validated the list:

1. Update each failing test to the new behavior. Rename it if its name states the old one.
2. Update `docs/decisions.md`: the principle, and what it replaces.
3. Update `docs/use-cases.md` and the `CHANGELOG.md`, in English, then the `*.fr.md` docs.

## 10. Report what got simpler

End with a short report to the owner, in French:

- the rules before and after, for example "3 rules → 2";
- the lines of code removed;
- the use cases lost, one by one, or "none";
- the open questions, for example a case the principle does not settle yet.

A deduction removed is not a lost use case. On PR #97, Claude counted as a loss that Chauffage
no longer sends the slot's value in the new HVAC mode. The owner answered that this was the
point. Count as lost only what a person could do before and can no longer do.

## Signs it worked

- The runtime code loses more lines than it gains.
- The rules fit in a few lines, with no "unless".
- The next bug report is settled by a rule, not by a new `if`.
