---
name: rules-not-deductions
description: Replace a pile of special cases in a behavior rule with a few rules that have no exception. Use when a fix would guess what someone meant from a change of state, when each review of a behavior finds new cases, when the owner says the rules are becoming unmaintainable, or before adding hidden state (a field that remembers "what it was before") to fix a bug.
---

# Rules, not deductions

A **deduction** guesses what a person meant from a change of state, and acts on the guess. For
example: "turned back on during an override, so the person wants the override back", or "the
HVAC mode changed, so the setpoint shown with it is not meant". Each deduction fixes one case and
opens new ones. On PR #97 (#91), four deductions were added for changes by hand, and two of them
broke at the next review.

This skill replaces such deductions with two or three rules that hold with no exception. The
reference example is the entry **A change by hand** in `docs/decisions.md`, reached in three
commits on `feat/slot-hvac-mode`: `5321133`, `7fa8edf` and `9f31fc0`.

## When to stop and use this skill

Stop before you code a fix when one of these is true:

- The fix reads a change of state and decides what the person "really" wanted.
- The fix needs hidden state, such as a field that keeps the override from before off
  (`before_off`).
- The fix adds an `if` for one combination of states, with a comment that explains the
  combination.
- The last review of this behavior found a case that an earlier fix created.

First ask: which existing rule covers this case? If one does, apply it and stop here.

## 1. List the deductions

Read the code, the tests, `docs/decisions.md` and `docs/use-cases.md` for the behavior. Write
one line per deduction, in plain words, with the case that motivated it. For example:

> - An override kept by an off override by hand, to give it back when the thermostat is turned
>   on again (`before_off`).
> - The setpoint shown again when leaving heat/cool is ignored.

Name what the deductions have in common. On #91, each one guessed an intent from a change of
state.

## 2. Remove the deductions in their own commit

Revert the deductions, their tests, their decision bullets and their use-case rows, in one
commit. Keep what is not a deduction, and say so in the commit message. On #91, the refusals of
`chauffage.set_override` and the labels stayed.

The commit message lists every deduction removed and says that a simpler rule is coming. This
commit makes the behavior simpler and older, not new. The tests must be green.

## 3. Find what the system controls

Write, in one sentence, what the system decides for the device. Base the rules on that, not on
what a person might mean. On #91: "A slot controls an HVAC mode and, in an HVAC mode that heats
or cools, a setpoint." The preset, the fan and the range follow from these two points.

Then write the rules in terms of **what the device shows**, never of an intent:

- A change by hand of what the slot controls changes the override on that point, and keeps the
  rest of the override.
- The override takes what the thermostat shows.
- When the thermostat is back to what the slot asks, the schedule resumes.

## 4. Check the rules against every case

Take every case of step 1, and every case the tests already cover. For each case, say what the
rules give, without adding anything. A case the rules get wrong means the rules are wrong: change
the rules, never add an exception.

A case left over may be acceptable when no real device produces it. Write it down with its
reason. On #91: "A thermostat that restarts on another setpoint than the one it showed while off
keeps an override: no device is known to do so."

## 5. Cut the rules again

Look for a rule that follows from another one, and merge them. On #91, "Chauffage sends nothing
after a change by hand" followed from "the override takes what the thermostat shows": the
thermostat already shows the override, so there is nothing to send. Three rules became two
(`9f31fc0`).

Look for words that hide a mode or a flag. Every "unless", "except" and "when … then" is a
candidate for removal.

## 6. Get the owner's OK before coding

Explain the rules to the owner in plain words, in French, with one example per rule. List what
the rules change for the user compared with the deductions. Code nothing until the owner says
yes.

Never present your own proposal as the owner's choice. In `docs/decisions.md`, write "the owner"
only after the owner validated the rules, and mark the entry as a proposal before that.

## 7. Code the rules, tests first

1. Write one test per rule, named after the rule. For example
   `test_a_change_by_hand_is_added_to_the_override_in_force` and
   `test_the_schedule_resumes_when_the_thermostat_does_what_its_slot_asks`. See them fail.
2. Rename the old tests whose expectations change, after what they now check. For example
   `switching_to_cool_by_hand_applies_the_slot_s_preset_in_cool` becomes
   `switching_to_cool_by_hand_sends_nothing`.
3. Write the code in the pure logic (`engine.py`) where possible. The runtime should shrink: the
   deductions lived there.
4. Run the tests on the three kinds of thermostats.

## 8. Record the rules

In the same commit as the code:

- **`docs/decisions.md`**: one entry with the sentence of step 3, the numbered rules and "with
  no exception". Then one paragraph: what the rules replace, why (each fixed one case, and two
  broke at the next review), and the cases left over with their reason. Remove the bullets of
  the old deductions.
- **`docs/use-cases.md`**: one row for the rules, with their tests. Rewrite the rows that the old
  deductions changed.
- **`CHANGELOG.md`**: what the user sees, in the user's words, with one example.

## Signs that it worked

- The commit that adds the rules removes more code than it adds in the runtime.
- The rules fit in five lines and have no "unless".
- A new bug report is answered by a rule, not by a new `if`.
