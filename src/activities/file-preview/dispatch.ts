/**
 * activities/file-preview/dispatch.ts - Generic "Aperçu du fichier" modal (#file-preview-modal):
 * given any File, picks the right viewer by extension and mounts it. Backs the pièces
 * justificatives folder preview (supporting-docs/actions.ts), but is deliberately not tied to
 * activities so it can be reused anywhere a File needs a quick look.
 *
 * Every viewer (including the existing pdf-viewer.ts/xlsx-viewer.ts, reused as-is — same
 * constructor signature) is loaded via dynamic import so pdfjs-dist/xlsx/mammoth stay out of the
 * main bundle, same as file-links/preview.ts already does for the form/submission/contract tabs.
 */
import { escapeHtml } from "../../utils/utils.ts";

const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".json", ".md", ".log", ".xml"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

let currentObjectUrl: string | null = null;
let currentDownload: { blob: Blob; fileName: string } | null = null;

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

function showMountError(mount: HTMLElement, message: string) {
  mount.innerHTML = `
    <div class="pdf-preview-error" style="margin: 40px auto; max-width: 80%;">
      <span class="error-badge">⚠️</span>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function showUnsupportedFallback(mount: HTMLElement, fileName: string) {
  mount.innerHTML = `
    <div class="pdf-preview-empty">
      <svg viewBox="0 0 24 24" class="pdf-preview-icon"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V7h2v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg>
      <p>Aucun aperçu disponible pour ce type de fichier (${escapeHtml(fileName)}). Utilisez « Télécharger » pour l'ouvrir avec une autre application.</p>
    </div>
  `;
}

import { triggerOpenFilePreviewModal } from "../../components/modals/FilePreviewModal.tsx";

async function openFilePreviewModal(file: File): Promise<void> {
  triggerOpenFilePreviewModal(file);
}

function downloadCurrentFile() {
  if (!currentDownload) return;
  const url = URL.createObjectURL(currentDownload.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentDownload.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function closeFilePreviewModal(): void {
  document.getElementById("file-preview-modal")?.classList.remove("active");
  document.getElementById("modal-backdrop")?.classList.remove("active");

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  currentDownload = null;

  // A PdfViewer/XlsxViewer in pseudo-fullscreen moves its element to document.body; clearing the
  // mount here would otherwise leave that detached element behind since it's no longer a
  // descendant of #file-preview-mount.
  const orphanedFullscreenViewer = document.querySelector(
    ".pdf-custom-viewer.pdf-fullscreen-mode, .xlsx-custom-viewer.xlsx-fullscreen-mode"
  );
  orphanedFullscreenViewer?.remove();

  const mount = document.getElementById("file-preview-mount");
  if (mount) mount.innerHTML = "";
}

function initFilePreviewModal(): void {
  document.getElementById("file-preview-modal-close")?.addEventListener("click", closeFilePreviewModal);
  document.getElementById("file-preview-download-btn")?.addEventListener("click", downloadCurrentFile);
  document.getElementById("modal-backdrop")?.addEventListener("click", () => {
    if (document.getElementById("file-preview-modal")?.classList.contains("active")) closeFilePreviewModal();
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.getElementById("file-preview-modal")?.classList.contains("active")) {
      closeFilePreviewModal();
    }
  });
}

export { openFilePreviewModal, closeFilePreviewModal, initFilePreviewModal, IMAGE_EXTENSIONS };
