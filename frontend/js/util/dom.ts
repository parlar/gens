/**
 * Reaching for an element the component's own template guarantees.
 *
 * `querySelector` returns null for a selector that matches nothing, and a
 * component reading its own shadow template has no reason to expect that: the
 * markup ships in the same file. So the null is not a case to handle, it is a
 * typo in the template -- and today that typo is silent, surfacing much later as
 * "cannot read properties of null" somewhere that has nothing to do with the
 * cause.
 *
 * Throwing at the point of the lookup names the selector that is missing, which
 * is the one piece of information the later crash never carries.
 */
export function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`the template has no element matching '${selector}'`);
  }
  return found;
}

/**
 * The shadow root a component attaches to itself.
 *
 * Nullable in the DOM types because not every element has one; these components
 * attach theirs in the constructor, so a null here means the element under test
 * is not the component it is supposed to be -- worth saying rather than reading
 * as "no match found".
 */
export function requireShadow(host: Element): ShadowRoot {
  if (host.shadowRoot === null) {
    throw new Error("this element has no shadow root");
  }
  return host.shadowRoot;
}
