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
