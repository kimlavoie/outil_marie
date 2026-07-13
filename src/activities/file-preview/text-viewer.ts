/**
 * activities/file-preview/text-viewer.ts - Plain-text preview (.txt, .csv, .json, .md, .log, .xml)
 * for the generic file preview modal (see dispatch.ts). No syntax highlighting (YAGNI) — just a
 * monospace, scrollable, escaped rendering.
 */
import { escapeHtml } from "../../utils/utils.ts";

// Above this size, decoding + injecting the whole file as one <pre> would freeze the UI for little
// benefit — truncate and point the user at the download button instead.
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

function renderTextPreview(mount: HTMLElement, buffer: ArrayBuffer): void {
  const truncated = buffer.byteLength > MAX_PREVIEW_BYTES;
  const bytes = truncated ? buffer.slice(0, MAX_PREVIEW_BYTES) : buffer;
  const text = new TextDecoder("utf-8").decode(bytes);

  mount.innerHTML = `
    <pre class="text-preview-content">${escapeHtml(text)}</pre>
    ${truncated ? `<div class="text-preview-truncated-notice">Fichier tronqué, trop volumineux pour l'aperçu — utilisez « Télécharger » pour le fichier complet.</div>` : ""}
  `;
}

export { renderTextPreview };
