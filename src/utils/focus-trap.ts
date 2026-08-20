/**
 * focus-trap.ts - Universal accessible focus trap & restoration manager.
 * Enforces keyboard focus containment within active modals & drawers (a11y ARIA 1.2 compliance),
 * and restores focus to the previously active element upon closing.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusTrapController {
  deactivate: () => void;
}

/**
 * Traps focus within `container`. Remembers previous active element to restore upon deactivation.
 */
export function trapFocus(container: HTMLElement, options: { initialFocusEl?: HTMLElement } = {}): FocusTrapController {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.style.display !== "none"
    );
  }

  // Set initial focus
  const focusables = getFocusableElements();
  const initial = options.initialFocusEl || focusables[0] || container;
  if (initial && typeof initial.focus === "function") {
    initial.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;

    const currentFocusables = getFocusableElements();
    if (currentFocusables.length === 0) {
      e.preventDefault();
      return;
    }

    const firstEl = currentFocusables[0];
    const lastEl = currentFocusables[currentFocusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstEl || !container.contains(document.activeElement)) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl || !container.contains(document.activeElement)) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }

  container.addEventListener("keydown", handleKeyDown);

  return {
    deactivate: () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    }
  };
}
