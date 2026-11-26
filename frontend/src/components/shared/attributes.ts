import { noChange } from 'lit';
import { Directive, PartType, directive } from 'lit/directive.js';
import type { ElementPart, PartInfo, PropertyPart } from 'lit/directive.js';

type Attributes = Record<string, string | number | boolean | null | undefined>;

// Sets the attributes of an element from an object, for an element whose attributes the caller
// chooses, such as the data-* attributes of a stepped field: `<input ${attributes({ 'data-edge':
// 'start' })}>`. true sets an empty attribute; false, null and undefined remove it.
class AttributesDirective extends Directive {
  set: string[] = [];

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('attributes() goes on an element');
  }

  render(_attrs: Attributes) {
    return noChange;
  }

  update(part: ElementPart, [attrs]: [Attributes]) {
    const el = part.element;
    for (const name of this.set) if (!(name in attrs)) el.removeAttribute(name);
    for (const [name, value] of Object.entries(attrs)) {
      if (value == null || value === false) el.removeAttribute(name);
      else el.setAttribute(name, value === true ? '' : String(value));
    }
    this.set = Object.keys(attrs);
    return noChange;
  }
}

export const attributes = directive(AttributesDirective);

// The value of a field that follows something that changes on its own (the setpoint of a
// thermostat), except while it is typed in: `.value=${followed(text)}`
class FollowedDirective extends Directive {
  render(value: string) {
    return value;
  }

  update(part: PropertyPart, [value]: [string]) {
    const el = part.element as HTMLInputElement;
    const root = el.getRootNode() as Document | ShadowRoot;
    if (root.activeElement !== el && el.value !== value) el.value = value;
    return noChange;
  }
}

export const followed = directive(FollowedDirective);
