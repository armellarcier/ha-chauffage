"""Activation rules: their templates are tracked, and a change of their outcome activates a
schedule (a schedule chosen by hand stays until then)."""

from __future__ import annotations

from collections.abc import Callable
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import Event, callback
from homeassistant.exceptions import TemplateError
from homeassistant.helpers.event import TrackTemplate, async_track_template_result
from homeassistant.helpers.template import Template, result_as_boolean

from ..storage import schema
from ..storage.schema import InvalidData
from ..domain.rules import rules_outcome, schedule_named

if TYPE_CHECKING:
    from .runtime import ChauffageRuntime

_LOGGER = logging.getLogger(__name__)


class RuleEngine:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime
        self._unsub: Callable[[], None] | None = None
        self.results: list[Any] = []  # each rule now (see render)

    async def set(self, rules: Any, default_schedule: Any) -> None:
        """New activation rules. They activate their schedule when what they give changes, as
        when their entities change: a schedule chosen by hand stays if the outcome is the same."""
        runtime = self._runtime
        normalized = schema.normalize_rules(rules, default_schedule, runtime.installation.schedule_ids)
        for rule in normalized:
            try:
                Template(rule["template"], runtime.hass).ensure_valid()
            except TemplateError as err:
                raise InvalidData(f"invalid template: {err}") from err
        runtime.installation.rules, runtime.installation.default_schedule = normalized, default_schedule
        runtime.installation.changed()
        self.track()
        await self.follow()

    @callback
    def track(self) -> None:
        """Watches the entities (and the time) the templates of the rules depend on."""
        self.stop()
        self.results = []

        @callback
        def changed() -> None:
            runtime = self._runtime
            runtime.entry.async_create_task(runtime.hass, self.follow(), "chauffage rules")

        self._unsub = self.track_templates([rule["template"] for rule in self._runtime.installation.rules], changed)

    @callback
    def stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def track_templates(self, templates: list[str], action: Callable[[], None]) -> Callable[[], None] | None:
        """Calls `action` (a callback) when the result of one of these templates may have changed:
        HA's template tracking (the entities they read, the time when they use now()). Empty and
        invalid templates are left out; None when nothing is tracked."""
        tracked = []
        for text in templates:
            template = Template(text, self._runtime.hass)
            try:
                template.ensure_valid()
            except TemplateError:
                continue
            if text.strip():
                tracked.append(TrackTemplate(template, None))
        if not tracked:
            return None

        @callback
        def changed(_event: Event | None, _updates: list) -> None:
            action()

        return async_track_template_result(self._runtime.hass, tracked, changed).async_remove

    def render(self, rule: dict[str, Any]) -> tuple[Any, str | None, str | None]:
        """(result, text, error) of a rule now. The result: True / False for a rule with a schedule,
        the schedule its template gives (False: none) for a rule without; None when its template is
        empty or fails (the rule does not apply)."""
        if not rule["template"].strip():
            return None, None, None
        try:
            text = Template(rule["template"], self._runtime.hass).async_render(parse_result=False)
        except TemplateError as err:
            return None, None, str(err)
        if rule["schedule"]:
            return result_as_boolean(text), text, None
        return schedule_named(text, self._runtime.installation.schedules) or False, text, None

    def _evaluate(self) -> list[Any]:
        results = []
        for rule in self._runtime.installation.rules:
            result, _, error = self.render(rule)
            if error:
                _LOGGER.warning("Activation rule %s: %s", rule["template"], error)
            results.append(result)
        return results

    async def follow(self, force: bool = False) -> None:
        """Activates the schedule the rules give when their outcome changed (or `force`)."""
        runtime = self._runtime
        results = self._evaluate()
        notify = results != self.results
        self.results = results
        outcome = rules_outcome(runtime.installation.rules, results, runtime.installation.default_schedule)
        changed = outcome != runtime.installation.rules_choice
        if changed:
            runtime.installation.rules_choice = outcome
            runtime.installation.changed()
        elif notify:
            runtime.installation.notify()
        if outcome is not None and (changed or force):
            await runtime.schedules.activate(outcome, source="rules")
