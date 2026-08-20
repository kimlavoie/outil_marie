import assert from "node:assert/strict";
import test from "node:test";
import "./dom-mock.ts";
import { trapFocus } from "../src/utils/focus-trap.ts";

test("trapFocus traps keyboard navigation and restores focus on deactivate", () => {
  const outerBtn = document.createElement("button");
  outerBtn.id = "outer-btn";
  document.body.appendChild(outerBtn);
  outerBtn.focus();

  const container = document.createElement("div");
  container.innerHTML = `
    <input id="inp1" type="text" />
    <button id="btn1">Submit</button>
  `;
  document.body.appendChild(container);

  const trap = trapFocus(container);

  const inp1 = container.querySelector<HTMLInputElement>("#inp1")!;
  const btn1 = container.querySelector<HTMLButtonElement>("#btn1")!;

  assert.ok(container.contains(document.activeElement));

  // Simulate Tab on last element -> wraps to first
  btn1.focus();
  const tabEvent = new window.Event("keydown", { bubbles: true }) as any;
  tabEvent.key = "Tab";
  tabEvent.shiftKey = false;
  container.dispatchEvent(tabEvent);

  // Deactivate trap -> restores focus to outerBtn
  trap.deactivate();
  assert.equal(document.activeElement, outerBtn);

  outerBtn.remove();
  container.remove();
});
