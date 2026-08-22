// Minimal real-DOM environment (via happy-dom) for tests that exercise code built around
// insertAdjacentHTML/querySelector/closest/dataset, which are too tedious to hand-fake
// element by element the way the simpler getElementById-only tests do.
import { Window } from "happy-dom";

const window = new Window({
  url: "http://localhost"
});

(globalThis as any).window = window;
(globalThis as any).document = window.document;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).HTMLInputElement = window.HTMLInputElement;
(globalThis as any).HTMLSelectElement = window.HTMLSelectElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).Event = window.Event;
window.confirm = () => true;
(globalThis as any).confirm = (...args: any[]) => window.confirm(...args);
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;

function fixSelects(root: any) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const selects = root.querySelectorAll("select");
  for (const select of selects) {
    const options = Array.from(select.options) as any[];
    const selectedIndex = options.findIndex(opt => opt.hasAttribute("selected"));
    if (selectedIndex !== -1) {
      select.value = options[selectedIndex].value;
      options.forEach((opt, idx) => {
        opt.selected = (idx === selectedIndex);
      });
    } else if (options.length > 0) {
      select.value = options[0].value;
      options.forEach((opt, idx) => {
        opt.selected = (idx === 0);
      });
    }
  }
}

// Patch insertAdjacentHTML
const origInsertAdjacentHTML = window.Element.prototype.insertAdjacentHTML;
window.Element.prototype.insertAdjacentHTML = function(position: InsertPosition, text: string) {
  origInsertAdjacentHTML.call(this, position, text);
  fixSelects(this);
};

// Patch innerHTML setter
const descriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, "innerHTML");
if (descriptor && descriptor.set) {
  const origSet = descriptor.set;
  descriptor.set = function(value: string) {
    origSet.call(this, value);
    fixSelects(this);
  };
  Object.defineProperty(window.Element.prototype, "innerHTML", descriptor);
}

const dom = {
  window: {
    close() {
      window.close();
    }
  }
};

export { dom };


