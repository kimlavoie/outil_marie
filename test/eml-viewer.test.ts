import test from "node:test";
import assert from "node:assert/strict";
import { dom } from "./dom-mock.ts";

test.after(() => dom.window.close());

import { renderEmlPreview } from "../src/activities/file-preview/eml-viewer.ts";

function toBuffer(raw: string): ArrayBuffer {
  return new TextEncoder().encode(raw).buffer as ArrayBuffer;
}

function setupMount(): HTMLElement {
  document.body.innerHTML = `<div id="mount"></div>`;
  return document.getElementById("mount")!;
}

test("renderEmlPreview shows headers and a plain-text body for a simple message", () => {
  const mount = setupMount();
  const raw = [
    "From: Alice <alice@example.com>",
    "To: Bob <bob@example.com>",
    "Subject: Facture de juillet",
    "Date: Sun, 12 Jul 2026 10:00:00 -0400",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Bonjour,\nVoici la facture.\n"
  ].join("\r\n");

  renderEmlPreview(mount, toBuffer(raw));

  assert.match(mount.innerHTML, /Facture de juillet/);
  assert.match(mount.innerHTML, /alice@example\.com/);
  assert.match(mount.innerHTML, /bob@example\.com/);
  assert.ok(mount.querySelector(".eml-preview-body-text"));
  assert.match(mount.querySelector(".eml-preview-body-text")!.textContent!, /Voici la facture/);
});

test("renderEmlPreview decodes RFC 2047 encoded-word subjects (both B and Q)", () => {
  const mount = setupMount();
  const rawB = ["Subject: =?UTF-8?B?w4l0w6kgw6AgTW9udHLDqWFs?=", "Content-Type: text/plain", "", "corps"].join("\r\n");
  renderEmlPreview(mount, toBuffer(rawB));
  assert.match(mount.innerHTML, /Été à Montréal/);

  const rawQ = ["Subject: =?UTF-8?Q?=C3=89t=C3=A9_=C3=A0_Montr=C3=A9al?=", "Content-Type: text/plain", "", "corps"].join("\r\n");
  renderEmlPreview(mount, toBuffer(rawQ));
  assert.match(mount.innerHTML, /Été à Montréal/);
});

test("renderEmlPreview decodes a quoted-printable body, including soft line breaks", () => {
  const mount = setupMount();
  const raw = [
    "Subject: Test",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Ligne longue qui continue=\nsur la ligne suivante, montant : 12,50=C2=A0$"
  ].join("\r\n");

  renderEmlPreview(mount, toBuffer(raw));
  const bodyText = mount.querySelector(".eml-preview-body-text")!.textContent!;
  assert.match(bodyText, /Ligne longue qui continuesur la ligne suivante/);
  assert.match(bodyText, /12,50 \$/);
});

test("renderEmlPreview decodes a base64 body", () => {
  const mount = setupMount();
  const bodyText = "Reçu : paiement complété.";
  const b64 = Buffer.from(bodyText, "utf-8").toString("base64");
  const raw = [
    "Subject: Reçu",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64
  ].join("\r\n");

  renderEmlPreview(mount, toBuffer(raw));
  assert.match(mount.querySelector(".eml-preview-body-text")!.textContent!, /Reçu : paiement complété\./);
});

test("renderEmlPreview prefers the html part of a multipart/alternative message and renders it in a sandboxed iframe", () => {
  const mount = setupMount();
  const boundary = "BOUNDARY123";
  const raw = [
    "Subject: Confirmation",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Version texte",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>Version <b>HTML</b></p>",
    `--${boundary}--`,
    ""
  ].join("\r\n");

  renderEmlPreview(mount, toBuffer(raw));

  const frame = mount.querySelector(".eml-preview-body-frame");
  assert.ok(frame, "expected an iframe for the html part");
  assert.equal(frame!.getAttribute("sandbox"), "");
  assert.match(frame!.getAttribute("srcdoc") || "", /Version.*HTML/);
  assert.equal(mount.querySelector(".eml-preview-body-text"), null);
});

test("renderEmlPreview shows a placeholder message for a body-less email", () => {
  const mount = setupMount();
  const raw = ["Subject: Vide", "Content-Type: text/plain", ""].join("\r\n");
  renderEmlPreview(mount, toBuffer(raw));
  assert.match(mount.querySelector(".eml-preview-body-text")!.textContent!, /message vide/);
});
