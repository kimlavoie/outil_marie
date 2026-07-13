/**
 * activities/supporting-docs/status.ts - The "Lier un dossier / liste des fichiers / Retirer" UI
 * shown for an activity's pièces justificatives folder. Split out of index.ts, mirroring
 * file-links/status.ts — but this render is async (permission check + directory listing both
 * require awaiting), unlike the synchronous renderFileLinkStatus.
 */
import { escapeHtml } from "../../utils/utils.ts";
import {
  pickAndLinkFolder,
  resolveFolderHandle,
  listFolderEntries,
  previewSupportingDocFile,
  downloadSupportingDocFile,
  downloadFolderAsZip,
  unlinkFolder
} from "./actions.ts";
import { IMAGE_EXTENSIONS } from "../file-preview/dispatch.ts";

const SUPPORTING_DOCS_CONTAINER_ID = "supporting-docs-status";

function formatFileSizeInline(bytes: number): string {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
}

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

// Object URLs created for the image thumbnails currently on screen — revoked at the start of every
// re-render so repeatedly opening/switching activities doesn't leak one per thumbnail.
let currentThumbnailUrls: string[] = [];

function revokeThumbnails() {
  currentThumbnailUrls.forEach(url => URL.revokeObjectURL(url));
  currentThumbnailUrls = [];
}

function actionButtonsHtml(): string {
  return `
    <button type="button" class="btn btn-secondary" id="supporting-docs-relink-btn" style="padding: 6px 12px; font-size: 0.85rem;">Changer de dossier</button>
    <button type="button" class="btn btn-danger" id="supporting-docs-unlink-btn" style="padding: 6px 12px; font-size: 0.85rem;">Retirer le lien</button>
  `;
}

function wireActionButtons(container: HTMLElement, act: any) {
  container.querySelector("#supporting-docs-relink-btn")?.addEventListener("click", () => pickAndLinkFolder(act.id));
  container.querySelector("#supporting-docs-unlink-btn")?.addEventListener("click", () => unlinkFolder(act.id));
}

// Renders the pièces justificatives status/list for the given activity into
// #supporting-docs-status. Async because resolving the folder handle's permission and listing its
// contents both require awaiting the File System Access API.
async function renderSupportingDocsStatus(act: any): Promise<void> {
  const container = document.getElementById(SUPPORTING_DOCS_CONTAINER_ID);
  if (!container) return;

  revokeThumbnails();

  if (!window.showDirectoryPicker) {
    container.innerHTML = `<span style="color: var(--text-muted);">Le lien de dossier nécessite un navigateur compatible avec l'API File System Access (Chrome ou Edge).</span>`;
    return;
  }

  const linkId = act.supporting_docs?.folder_link_id;
  if (!linkId) {
    container.innerHTML = `
      <span style="color: var(--text-muted);">Aucun dossier lié</span>
      <button type="button" class="btn btn-secondary" id="supporting-docs-link-btn" style="padding: 6px 12px; font-size: 0.85rem;">Lier un dossier</button>
    `;
    container.querySelector("#supporting-docs-link-btn")?.addEventListener("click", () => pickAndLinkFolder(act.id));
    return;
  }

  container.innerHTML = `<span style="color: var(--text-muted);">Chargement du dossier...</span>`;

  const resolved = await resolveFolderHandle(linkId);
  // Anti-race guard: if the drawer was closed/reopened for another activity while we were
  // awaiting, the template's innerHTML was replaced and this container element is detached —
  // writing into it would silently corrupt whatever is now on screen.
  if (document.getElementById(SUPPORTING_DOCS_CONTAINER_ID) !== container) return;

  if (!resolved) {
    container.innerHTML = `
      <span class="badge badge-warning">Autorisation requise</span>
      <button type="button" class="btn btn-primary" id="supporting-docs-authorize-btn" style="padding: 6px 12px; font-size: 0.85rem;">Autoriser l'accès</button>
      ${actionButtonsHtml()}
    `;
    container.querySelector("#supporting-docs-authorize-btn")?.addEventListener("click", () => renderSupportingDocsStatus(act));
    wireActionButtons(container, act);
    return;
  }

  let entries;
  try {
    entries = await listFolderEntries(resolved.handle);
  } catch (e: any) {
    if (document.getElementById(SUPPORTING_DOCS_CONTAINER_ID) !== container) return;
    container.innerHTML = `
      <span style="color: var(--danger-text);">Impossible d'accéder au dossier « ${escapeHtml(resolved.name)} » : ${escapeHtml(e.message || e.name || "erreur inconnue")}</span>
      ${actionButtonsHtml()}
    `;
    wireActionButtons(container, act);
    return;
  }

  if (document.getElementById(SUPPORTING_DOCS_CONTAINER_ID) !== container) return;

  const listHtml =
    entries.length === 0
      ? `<div style="color: var(--text-muted); margin-top: 8px;">Ce dossier est vide.</div>`
      : `
        <ul class="supporting-docs-list">
          ${entries
            .map((entry, i) => {
              const isImage = IMAGE_EXTENSIONS.has(extensionOf(entry.name));
              let thumbHtml = "";
              if (isImage) {
                const url = URL.createObjectURL(entry.file);
                currentThumbnailUrls.push(url);
                thumbHtml = `<img class="supporting-docs-thumb" src="${url}" alt="" />`;
              }
              return `
            <li>
              ${thumbHtml}
              <span>${escapeHtml(entry.name)}</span>
              <span class="supporting-docs-meta">${formatFileSizeInline(entry.size)} · ${new Date(entry.lastModified).toLocaleDateString("fr-CA")}</span>
              <button type="button" class="btn btn-secondary" data-supporting-doc-preview-idx="${i}" style="padding: 4px 10px; font-size: 0.8rem;">Aperçu</button>
              <button type="button" class="btn btn-secondary" data-supporting-doc-download-idx="${i}" style="padding: 4px 10px; font-size: 0.8rem;">Ouvrir</button>
            </li>
          `;
            })
            .join("")}
        </ul>
      `;

  const downloadAllBtnHtml =
    entries.length > 0
      ? `<button type="button" class="btn btn-secondary" id="supporting-docs-download-all-btn" style="padding: 6px 12px; font-size: 0.85rem;">Télécharger tout (ZIP)</button>`
      : "";

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
      <span class="badge badge-success">Dossier lié : ${escapeHtml(resolved.name)}</span>
      ${downloadAllBtnHtml}
      ${actionButtonsHtml()}
    </div>
    ${listHtml}
  `;
  wireActionButtons(container, act);
  container.querySelector("#supporting-docs-download-all-btn")?.addEventListener("click", () => downloadFolderAsZip(resolved.name, entries));
  container.querySelectorAll("[data-supporting-doc-preview-idx]").forEach(btn => {
    const idx = Number(btn.getAttribute("data-supporting-doc-preview-idx"));
    btn.addEventListener("click", () => previewSupportingDocFile(entries[idx].handle));
  });
  container.querySelectorAll("[data-supporting-doc-download-idx]").forEach(btn => {
    const idx = Number(btn.getAttribute("data-supporting-doc-download-idx"));
    btn.addEventListener("click", () => downloadSupportingDocFile(entries[idx].handle));
  });
}

export { SUPPORTING_DOCS_CONTAINER_ID, renderSupportingDocsStatus };
