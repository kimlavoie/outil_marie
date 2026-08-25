/**
 * activities/file-links/preview.ts - Inline preview of a linked submission/contract (.xlsx) or
 * form (.pdf) file, requesting File System Access read permission when needed. Split out of
 * index.ts (see that file for why it stays a barrel importing/re-exporting this alongside
 * db.ts/actions.ts/status.ts).
 */
import { showToast, escapeHtml } from "../../utils/utils.ts";
import { idbGetFileLink } from "./db.ts";

const XLSX_PREVIEW_CONTAINER_IDS: Record<"submission" | "contract", string> = {
  submission: "submission-xlsx-preview",
  contract: "contract-xlsx-preview"
};

const XLSX_PREVIEW_EMPTY_LABEL: Record<"submission" | "contract", string> = {
  submission: "Aucune soumission liée à cette activité pour le moment.",
  contract: "Aucun contrat lié à cette activité pour le moment."
};

async function renderPdfPreview(act: any) {
  const previewContainer = document.getElementById("form-pdf-preview");
  if (!previewContainer) return;

  const linkId = act.form?.file_link_id;
  if (!linkId) {
    previewContainer.innerHTML = `
      <div class="pdf-preview-empty">
        <svg viewBox="0 0 24 24" class="pdf-preview-icon"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V7h2v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg>
        <p>Aucun formulaire PDF lié à cette réservation pour le moment.</p>
      </div>
    `;
    return;
  }

  const record = await idbGetFileLink(linkId);
  if (!record) {
    previewContainer.innerHTML = `
      <div class="pdf-preview-error">
        <span class="error-badge">⚠️</span>
        <p>Fichier introuvable (peut-être lié depuis un autre appareil).</p>
      </div>
    `;
    return;
  }

  try {
    const perm = await record.handle.queryPermission({ mode: "read" });
    if (perm === "granted") {
      const file = await record.handle.getFile();

      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        previewContainer.innerHTML = `
          <div class="pdf-preview-error">
            <span class="error-badge">⚠️</span>
            <p>Le fichier lié n'est pas un document PDF (${escapeHtml(file.name)}).</p>
          </div>
        `;
        return;
      }

      previewContainer.innerHTML = `
        <div class="pdf-preview-wrapper">
          <div class="pdf-preview-header">
            <div class="pdf-preview-title">
              <svg viewBox="0 0 24 24" class="pdf-file-icon"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h2c.83 0 1.5.67 1.5 1.5v3.5zm4-3.25c0 .41-.34.75-.75.75H19v1h.75c.41 0 .75.34.75.75s-.34.75-.75.75H19v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1h2c.41 0 .75.34.75.75zM3 6c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h13c.55 0 1-.45 1-1s-.45-1-1-1H5c-.55 0-1-.45-1-1V7c0-.55-.45-1-1-1z"/></svg>
              <span>${escapeHtml(record.name)}</span>
            </div>
          </div>
          <div id="pdf-viewer-mount"></div>
        </div>
      `;

      const mountEl = previewContainer.querySelector("#pdf-viewer-mount") as HTMLElement;
      const buffer = await file.arrayBuffer();
      const { PdfViewer } = await import("../pdf-viewer.ts");
      const viewer = new PdfViewer(mountEl, buffer, record.name);
      await viewer.init();
    } else {
      previewContainer.innerHTML = `
        <div class="pdf-preview-permission">
          <div class="permission-icon-container">
            <svg viewBox="0 0 24 24" class="lock-icon"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          </div>
          <h3>Accès sécurisé requis</h3>
          <p>Le navigateur requiert votre autorisation pour accéder au fichier local <strong>${escapeHtml(record.name)}</strong> et l'afficher.</p>
          <button type="button" class="btn btn-primary" id="btn-request-pdf-permission">
            Autoriser l'accès et afficher le PDF
          </button>
        </div>
      `;
      previewContainer.querySelector("#btn-request-pdf-permission")!.addEventListener("click", async () => {
        const newPerm = await record.handle.requestPermission({ mode: "read" });
        if (newPerm === "granted") {
          renderPdfPreview(act);
        } else {
          showToast("Permission d'accès refusée.", "warning");
        }
      });
    }
  } catch (err: any) {
    previewContainer.innerHTML = `
      <div class="pdf-preview-error">
        <span class="error-badge">⚠️</span>
        <p>Erreur d'accès au fichier : ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

async function renderXlsxPreview(kind: "submission" | "contract", act: any) {
  const previewContainer = document.getElementById(XLSX_PREVIEW_CONTAINER_IDS[kind]);
  if (!previewContainer) return;

  const linkId = act[kind]?.file_link_id;
  if (!linkId) {
    previewContainer.innerHTML = `
      <div class="pdf-preview-empty">
        <svg viewBox="0 0 24 24" class="pdf-preview-icon"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V7h2v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg>
        <p>${escapeHtml(XLSX_PREVIEW_EMPTY_LABEL[kind])}</p>
      </div>
    `;
    return;
  }

  const record = await idbGetFileLink(linkId);
  if (!record) {
    previewContainer.innerHTML = `
      <div class="pdf-preview-error">
        <span class="error-badge">⚠️</span>
        <p>Fichier introuvable (peut-être lié depuis un autre appareil).</p>
      </div>
    `;
    return;
  }

  try {
    const perm = await record.handle.queryPermission({ mode: "read" });
    if (perm === "granted") {
      const file = await record.handle.getFile();

      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        previewContainer.innerHTML = `
          <div class="pdf-preview-error">
            <span class="error-badge">⚠️</span>
            <p>Le fichier lié n'est pas un classeur Excel (${escapeHtml(file.name)}).</p>
          </div>
        `;
        return;
      }

      previewContainer.innerHTML = `
        <div class="pdf-preview-wrapper">
          <div class="pdf-preview-header">
            <div class="pdf-preview-title">
              <svg viewBox="0 0 24 24" class="xlsx-file-icon"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h2c.83 0 1.5.67 1.5 1.5v3.5zm4-3.25c0 .41-.34.75-.75.75H19v1h.75c.41 0 .75.34.75.75s-.34.75-.75.75H19v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1h2c.41 0 .75.34.75.75zM3 6c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h13c.55 0 1-.45 1-1s-.45-1-1-1H5c-.55 0-1-.45-1-1V7c0-.55-.45-1-1-1z"/></svg>
              <span>${escapeHtml(record.name)}</span>
            </div>
          </div>
          <div id="xlsx-viewer-mount-${kind}"></div>
        </div>
      `;

      const mountEl = previewContainer.querySelector(`#xlsx-viewer-mount-${kind}`) as HTMLElement;
      const buffer = await file.arrayBuffer();
      const { XlsxViewer } = await import("../xlsx-viewer.ts");
      const viewer = new XlsxViewer(mountEl, buffer, record.name);
      await viewer.init();
    } else {
      previewContainer.innerHTML = `
        <div class="pdf-preview-permission">
          <div class="permission-icon-container">
            <svg viewBox="0 0 24 24" class="lock-icon"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          </div>
          <h3>Accès sécurisé requis</h3>
          <p>Le navigateur requiert votre autorisation pour accéder au fichier local <strong>${escapeHtml(record.name)}</strong> et l'afficher.</p>
          <button type="button" class="btn btn-primary" id="btn-request-xlsx-permission-${kind}">
            Autoriser l'accès et afficher le fichier
          </button>
        </div>
      `;
      previewContainer.querySelector(`#btn-request-xlsx-permission-${kind}`)!.addEventListener("click", async () => {
        const newPerm = await record.handle.requestPermission({ mode: "read" });
        if (newPerm === "granted") {
          renderXlsxPreview(kind, act);
        } else {
          showToast("Permission d'accès refusée.", "warning");
        }
      });
    }
  } catch (err: any) {
    previewContainer.innerHTML = `
      <div class="pdf-preview-error">
        <span class="error-badge">⚠️</span>
        <p>Erreur d'accès au fichier : ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

export { XLSX_PREVIEW_CONTAINER_IDS, renderPdfPreview, renderXlsxPreview };
