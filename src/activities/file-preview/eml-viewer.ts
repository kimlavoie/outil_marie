/**
 * activities/file-preview/eml-viewer.ts - Basic .eml (RFC 822 / MIME email) preview for the generic
 * file preview modal (see dispatch.ts). Handles what pièces justificatives actually contain — a
 * single text/plain or text/html body, or a multipart/alternative offering both — not a full MIME
 * reader (nested multipart/mixed attachments are ignored, not listed). The HTML body is rendered
 * inside a sandboxed, script-less iframe rather than injected into the page's own DOM: an .eml can
 * carry arbitrary attacker-controlled HTML/script, and this app must not execute it in its own
 * origin.
 */
import { escapeHtml } from "../../utils/utils.ts";

interface EmlPart {
  headers: Map<string, string>;
  body: string;
}

function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = block.split("\n");
  let currentKey = "";
  for (const line of lines) {
    if (/^[ \t]/.test(line) && currentKey) {
      headers.set(currentKey, headers.get(currentKey) + " " + line.trim());
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers.set(key, value);
    currentKey = key;
  }
  return headers;
}

function splitHeadersAndBody(raw: string): EmlPart {
  const sepIdx = raw.indexOf("\n\n");
  if (sepIdx === -1) return { headers: parseHeaders(raw), body: "" };
  return { headers: parseHeaders(raw.slice(0, sepIdx)), body: raw.slice(sepIdx + 2) };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function quotedPrintableToBytes(qp: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < qp.length; i++) {
    if (qp[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(qp.slice(i + 1, i + 3))) {
      bytes.push(parseInt(qp.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(qp.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}

function safeDecode(charset: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// Decodes RFC 2047 encoded-word sequences in header values, e.g. "=?UTF-8?B?w6lt?=" -> "ém".
function decodeEncodedWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, enc, text) => {
    if (enc.toUpperCase() === "B") return safeDecode(charset, base64ToBytes(text));
    return safeDecode(charset, quotedPrintableToBytes(text.replace(/_/g, " ")));
  });
}

function extractCharset(contentType: string): string {
  const m = /charset="?([^;"]+)"?/i.exec(contentType);
  return m ? m[1].trim() : "utf-8";
}

function extractBoundary(contentType: string): string | null {
  const m = /boundary="?([^;"]+)"?/i.exec(contentType);
  return m ? m[1].trim() : null;
}

function decodeBody(body: string, transferEncoding: string, charset: string): string {
  const enc = transferEncoding.toLowerCase();
  if (enc === "base64") return safeDecode(charset, base64ToBytes(body));
  if (enc === "quoted-printable") return safeDecode(charset, quotedPrintableToBytes(body.replace(/=\n/g, "")));
  return body;
}

// Walks a (possibly multipart) message and returns the best body to show: prefers text/html,
// falls back to text/plain.
function findBestBody(raw: string, depth = 0): { html: string | null; text: string | null } {
  if (depth > 5) return { html: null, text: null };
  const { headers, body } = splitHeadersAndBody(raw);
  const contentType = headers.get("content-type") || "text/plain";
  const transferEncoding = headers.get("content-transfer-encoding") || "";
  const charset = extractCharset(contentType);

  if (/^multipart\//i.test(contentType)) {
    const boundary = extractBoundary(contentType);
    if (!boundary) return { html: null, text: null };
    // Drop the preamble (before the first boundary) and the closing "--boundary--" marker.
    const parts = body.split(`--${boundary}`).slice(1, -1);
    let html: string | null = null;
    let text: string | null = null;
    for (const part of parts) {
      const result = findBestBody(part.replace(/^\n/, ""), depth + 1);
      if (result.html && !html) html = result.html;
      if (result.text && !text) text = result.text;
    }
    return { html, text };
  }

  const decoded = decodeBody(body, transferEncoding, charset);
  if (/^text\/html/i.test(contentType)) return { html: decoded, text: null };
  if (/^text\/plain/i.test(contentType) || !headers.has("content-type")) return { html: null, text: decoded };
  return { html: null, text: null };
}

function renderEmlPreview(mount: HTMLElement, buffer: ArrayBuffer): void {
  const raw = new TextDecoder("utf-8").decode(buffer).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const { headers } = splitHeadersAndBody(raw);
  const subject = decodeEncodedWords(headers.get("subject") || "(sans objet)");
  const from = decodeEncodedWords(headers.get("from") || "");
  const to = decodeEncodedWords(headers.get("to") || "");
  const date = headers.get("date") || "";

  const { html, text } = findBestBody(raw);

  const bodyHtml = html
    ? `<iframe class="eml-preview-body-frame" sandbox="" srcdoc="${escapeHtml(html)}"></iframe>`
    : `<pre class="eml-preview-body-text">${escapeHtml(text || "(message vide)")}</pre>`;

  mount.innerHTML = `
    <div class="eml-preview">
      <div class="eml-preview-headers">
        <div class="eml-preview-header-row"><span class="eml-preview-header-label">Objet</span><span>${escapeHtml(subject)}</span></div>
        ${from ? `<div class="eml-preview-header-row"><span class="eml-preview-header-label">De</span><span>${escapeHtml(from)}</span></div>` : ""}
        ${to ? `<div class="eml-preview-header-row"><span class="eml-preview-header-label">À</span><span>${escapeHtml(to)}</span></div>` : ""}
        ${date ? `<div class="eml-preview-header-row"><span class="eml-preview-header-label">Date</span><span>${escapeHtml(date)}</span></div>` : ""}
      </div>
      ${bodyHtml}
    </div>
  `;
}

export { renderEmlPreview };
