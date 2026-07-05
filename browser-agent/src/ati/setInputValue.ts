// React/Vue-safe установка значения в input/textarea.
// Использует native setter + input/change events.

export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  try {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const setter = desc?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

export function blurElement(el: HTMLElement): void {
  try { el.dispatchEvent(new FocusEvent("blur", { bubbles: true })); } catch { /* noop */ }
}
