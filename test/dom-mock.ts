// Minimal real-DOM environment (via jsdom) for tests that exercise code built around
// insertAdjacentHTML/querySelector/closest/dataset, which are too tedious to hand-fake
// element by element the way the simpler getElementById-only tests do.
import { JSDOM } from "jsdom";

// pretendToBeVisual is deliberately left off: it schedules a recurring rAF timer on the
// window that never gets cleared, which keeps the node --test process alive after the run
// finishes. Nothing under test needs real animation frames, so a one-shot stub is enough.
const dom = new JSDOM("<!doctype html><html><body></body></html>");

(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLSelectElement = dom.window.HTMLSelectElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).Event = dom.window.Event;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;

export { dom };
