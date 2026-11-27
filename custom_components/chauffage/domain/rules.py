"""Activation rules: which schedule they give (docs/activation-rules.md)."""

from __future__ import annotations

from typing import Any


def schedule_named(text: str, schedules: list[dict[str, str]]) -> str | None:
    """The schedule a template gives: its id, else its name (any case); None if none matches."""
    text = text.strip()
    if any(s["id"] == text for s in schedules):
        return text
    return next((s["id"] for s in schedules if s["name"].casefold() == text.casefold()), None)


def rules_outcome(rules: list[dict[str, Any]], results: list[Any], default: str | None) -> str | None:
    """The schedule of the first rule that applies (true, or a schedule given by its template),
    else the default one (a failed template does not apply); None without rules."""
    if not rules:
        return None
    return next((rule["schedule"] or result for rule, result in zip(rules, results) if result), default)
