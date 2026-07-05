// Выбор опции в <select> либо в кастомном dropdown по текстовой подписи.
import { setInputValue } from "./setInputValue";

export function selectNativeOption(sel: HTMLSelectElement, valueOrLabel: string): boolean {
  const target = valueOrLabel.trim().toLowerCase();
  for (const opt of Array.from(sel.options)) {
    if (opt.value.toLowerCase() === target || opt.textContent?.trim().toLowerCase() === target) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  }
  return false;
}

export function selectComboOption(input: HTMLInputElement, label: string): boolean {
  // Кастомный combobox: пишем в input, кликаем по появившейся опции с нужным текстом.
  setInputValue(input, label);
  const listRoot = document.querySelector('[role="listbox"], [class*="dropdown"], [class*="Suggest"]');
  if (!listRoot) return false;
  const options = listRoot.querySelectorAll('[role="option"], li, div');
  const target = label.trim().toLowerCase();
  for (const o of Array.from(options)) {
    if ((o.textContent ?? "").trim().toLowerCase().includes(target)) {
      (o as HTMLElement).click();
      return true;
    }
  }
  return false;
}
