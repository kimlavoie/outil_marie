import React, { useState, useEffect, useRef } from "react";
import { escapeHtml } from "../../utils/utils.ts";

const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".json", ".md", ".log", ".xml"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

let openFilePreviewSubscriber: ((file: File) => void) | null = null;

export function isFilePreviewModalSubscribed() {
  return openFilePreviewSubscriber !== null;
}

export function triggerOpenFilePreviewModal(file: File) {
  if (openFilePreviewSubscriber) {
    openFilePreviewSubscriber(file);
  }
}

export const FilePreviewModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    openFilePreviewSubscriber = (file: File) => {
      setCurrentFile(file);
      setIsOpen(true);
    };
    return () => {
      openFilePreviewSubscriber = null;
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !currentFile || !mountRef.current) return;

    const mount = mountRef.current;
    mount.innerHTML = `<div class="pdf-loading-spinner" style="position: static; padding: 60px 0; text-align: center; color: var(--text-muted);">Chargement de l'aperçu...</div>`;

    const ext = extensionOf(currentFile.name);
    let cancelled = false;

    async function loadPreview() {
      try {
        if (ext === ".pdf") {
          const buffer = await currentFile!.arrayBuffer();
          if (cancelled) return;
          const { PdfViewer } = await import("../../activities/pdf-viewer.ts");
          await new PdfViewer(mount, buffer, currentFile!.name).init();
        } else if (ext === ".xlsx" || ext === ".xls") {
          const buffer = await currentFile!.arrayBuffer();
          if (cancelled) return;
          const { XlsxViewer } = await import("../../activities/xlsx-viewer.ts");
          await new XlsxViewer(mount, buffer, currentFile!.name).init();
        } else if (ext === ".docx") {
          const buffer = await currentFile!.arrayBuffer();
          if (cancelled) return;
          const { renderDocxPreview } = await import("../../activities/file-preview/docx-viewer.ts");
          await renderDocxPreview(mount, buffer);
        } else if (ext === ".eml") {
          const buffer = await currentFile!.arrayBuffer();
          if (cancelled) return;
          const { renderEmlPreview } = await import("../../activities/file-preview/eml-viewer.ts");
          renderEmlPreview(mount, buffer);
        } else if (TEXT_EXTENSIONS.has(ext)) {
          const buffer = await currentFile!.arrayBuffer();
          if (cancelled) return;
          const { renderTextPreview } = await import("../../activities/file-preview/text-viewer.ts");
          renderTextPreview(mount, buffer);
        } else if (IMAGE_EXTENSIONS.has(ext)) {
          const { renderImagePreview } = await import("../../activities/file-preview/image-viewer.ts");
          objectUrlRef.current = renderImagePreview(mount, currentFile!, currentFile!.name);
        } else {
          mount.innerHTML = `
            <div class="pdf-preview-empty">
              <svg viewBox="0 0 24 24" class="pdf-preview-icon"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V7h2v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg>
              <p>Aucun aperçu disponible pour ce type de fichier (${escapeHtml(currentFile!.name)}). Utilisez « Télécharger » pour l'ouvrir avec une autre application.</p>
            </div>
          `;
        }
      } catch (e: any) {
        mount.innerHTML = `
          <div class="pdf-preview-error" style="margin: 40px auto; max-width: 80%;">
            <span class="error-badge">⚠️</span>
            <p>${escapeHtml(`Impossible d'afficher l'aperçu : ${e.message || e}`)}</p>
          </div>
        `;
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      const orphanedViewer = document.querySelector(
        ".pdf-custom-viewer.pdf-fullscreen-mode, .xlsx-custom-viewer.xlsx-fullscreen-mode"
      );
      orphanedViewer?.remove();
      if (mount) mount.innerHTML = "";
    };
  }, [isOpen, currentFile]);

  if (!isOpen || !currentFile) return null;

  const handleDownload = () => {
    const url = URL.createObjectURL(currentFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="modal-backdrop active" onClick={() => setIsOpen(false)} />
      <div
        className="modal active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-modal-title"
        style={{ width: "900px" }}
      >
        <div className="modal-header">
          <h3 className="modal-title" id="file-preview-modal-title">
            {currentFile.name}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" className="btn btn-secondary" onClick={handleDownload}>
              Télécharger
            </button>
            <button type="button" className="btn-icon" aria-label="Fermer" onClick={() => setIsOpen(false)}>
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "currentColor" }}>
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="modal-content" ref={mountRef} />
      </div>
    </>
  );
};
