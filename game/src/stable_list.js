// Keep interactive nodes attached while their order is unchanged. Replacing a
// live roster between pointer-down and click can discard focus and the click.
export function syncChildren(parent, desired) {
  for (let i = 0; i < desired.length; i++) {
    if (parent.children[i] !== desired[i]) parent.insertBefore(desired[i], parent.children[i] || null);
  }
  while (parent.children.length > desired.length) parent.lastChild.remove();
}
