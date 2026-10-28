# Writing style

Read this guide before you edit a doc. It applies to everything written for a person: the
READMEs, CONTRIBUTING, the changelog, issues, pull requests and code comments, in English and in
French.

## Rules

1. **Start from what the reader wants to do**, not from what the system does.
2. **Address the reader**: "you" in English, "vous" in French.
3. **Write one idea per sentence**, with a simple structure: a subject, a verb, a complement.
4. **Name the subject, even if you repeat it.** Avoid "y", "en", "ce qui l'a…", "it" or "which"
   when the reader has to go back a sentence to understand them. Avoid them, but don't forbid
   them.
5. **Be explicit rather than implicit**, as long as the sentence does not get too heavy: "the
   minimum Home Assistant version", not "the minimum"; "the test matrix", not "the matrix".
6. **Give an example rather than every case.** Complete lists belong in a reference table, in
   [use-cases.md](use-cases.md) or in the tests, not in parentheses in the middle of a sentence.
7. **Write one paragraph per question of the reader**: for example, what happens, then how to
   stop it.
8. **Show the structure.** When the order matters, number the steps with `###` headings: the
   reader finds their way, and each step has an anchor to link to in an issue. Use short bold
   labels so that the reader finds the part they need at a glance.
9. **Don't chain colons and semicolons**, and don't write long parentheses or verbless
   fragments.
10. **In CONTRIBUTING, say what to do**, in the imperative. Write the reasons in
    [decisions.md](decisions.md).
11. **Write French in French**, from the meaning, without copying the English sentence.
12. **Don't rewrite the past.** Past changelog entries, release notes and commit messages stay as
    they are. New text follows these rules.

These rules serve the reader. When a rule makes a text harder to read, the text wins.

## Signs of a text to rewrite

- The subject comes last, or two ideas share one sentence with commas: "…, et pourquoi, …".
- A chain like `X: Y; Z` stands for two or three short sentences.
- A parenthesis lists every case: "(expired, back to the schedule, removed, paused…)".
- A bullet runs over three or four lines.
- The French sentence follows the English one word by word.
- The text describes the system ("is shown", "se suit") instead of telling the reader what to do.

## Examples

### A feature description

Before:

> **dérogations** : une consigne changée à la main devient temporaire (2 h par défaut), visible
> et ajustable (sa fin, et sa valeur : un préréglage ou une température) sur la carte […]

After:

> **Dérogations.** Si vous changez une consigne à la main, Chauffage la garde 2 heures
> (réglable), puis revient au planning. Vous pouvez voir et modifier la dérogation depuis la
> carte.
>
> La dérogation s'arrête dès que vous remettez le thermostat sur la consigne prévue.

### A troubleshooting section

Before:

> Ce que Chauffage fait aux thermostats, et pourquoi, se suit :
>
> - **Journal de bord** : une dérogation qui commence (d'où elle vient : le thermostat, la
>   carte, un service) ou qui finit (expirée, retour au planning sur le thermostat, retirée,
>   thermostat en pause…) est dans le journal du thermostat ; un planning activé (et par quoi)
>   dans celui du sélecteur.

After:

> ## Dépannage
>
> Un thermostat n'a pas fait ce que vous attendiez ? Voici où chercher, dans l'ordre.
>
> ### 1. Le journal de bord du thermostat
>
> Le journal de bord du thermostat note chaque dérogation. Il indique d'où vient la dérogation
> (la molette, la carte ou une automatisation) et pourquoi elle s'est arrêtée.
>
> Les changements de planning sont notés dans le journal de bord du sélecteur *Planning actif*.

### Contributor instructions

Before:

> **The minimum only rises when a Home Assistant API requires it**: a feature or a fix needs an
> API that older versions do not have, or an API we use is removed. Not to follow the releases,
> nor to drop old code that still works. A rise goes into a minor version, with the reason in
> the changelog ("Upgrading").

After:

> ### 1. Raising the minimum Home Assistant version
>
> Raise the minimum Home Assistant version only when the code needs a Home Assistant API that
> older versions don't have, or when Home Assistant removes an API we use. Raise it in a minor
> version of ha-chauffage, and give the reason in the changelog, under "Upgrading".
