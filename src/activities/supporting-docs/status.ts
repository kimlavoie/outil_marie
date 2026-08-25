/**
 * activities/supporting-docs/status.ts - The "Lier un dossier / liste des fichiers / Retirer" UI
 * shown for an activity's pièces justificatives folder. Split out of index.ts, mirroring
 * file-links/status.ts — but this render is async (permission check + directory listing both
 * require awaiting), unlike the synchronous renderFileLinkStatus.
 *
 * The file list also supports client-side search/sort (no extra disk read — filtered/sorted from
 * the already-listed entries) and drag-and-drop upload (writes into the linked folder's root,
 * requesting a one-time readwrite permission upgrade — see writeFilesToFolder in actions.ts).
 */
import { escapeHtml, showToast } from "../../utils/utils.ts";
import {
  pickAndLinkFolder,
  resolveFolderHandle,
  listFolderEntries,
  previewSupportingDocFile,
  downloadSupportingDocFile,
  downloadFolderAsZip,
  writeFilesToFolder,
  unlinkFolder
} from "./actions.ts";
import type { SupportingDocEntry } from "./actions.ts";
import { IMAGE_EXTENSIONS } from "../file-preview/dispatch.ts";

const SUPPORTING_DOCS_CONTAINER_ID = "supporting-docs-status";

type SortKey = "name-asc" | "name-desc" | "date-desc" | "date-asc" | "size-desc" | "size-asc";

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
// re-render so repeatedly opening/switching activities (or re-filtering the list) doesn't leak one
// per thumbnail.
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
  container.querySelector("#supporting-docs-refresh-btn")?.addEventListener("click", () => renderSupportingDocsStatus(act));
}

function filterAndSortEntries(entries: SupportingDocEntry[], query: string, sortKey: SortKey): SupportingDocEntry[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? entries.filter(e => e.name.toLowerCase().includes(q) || e.relativePath.toLowerCase().includes(q)) : entries.slice();

  const [field, dir] = sortKey.split("-") as ["name" | "date" | "size", "asc" | "desc"];
  filtered.sort((a, b) => {
    let cmp: number;
    if (field === "date") cmp = a.lastModified - b.lastModified;
    else if (field === "size") cmp = a.size - b.size;
    else cmp = (a.relativePath + "/" + a.name).localeCompare(b.relativePath + "/" + b.name, "fr");
    return dir === "desc" ? -cmp : cmp;
  });
  return filtered;
}

// Renders just the file list (not the toolbar/dropzone around it) into #supporting-docs-list-mount,
// given the already-fetched entries and current search/sort state. Called on first render and again
// on every search/sort change — no disk access here, so it stays instant.
function renderEntryList(mount: HTMLElement, entries: SupportingDocEntry[], query: string, sortKey: SortKey): void {
  revokeThumbnails();
  const visible = filterAndSortEntries(entries, query, sortKey);

  if (entries.length === 0) {
    mount.innerHTML = `<div style="color: var(--text-muted); margin-top: 8px;">Ce dossier est vide.</div>`;
    return;
  }
  if (visible.length === 0) {
    mount.innerHTML = `<div style="color: var(--text-muted); margin-top: 8px;">Aucun fichier ne correspond à la recherche.</div>`;
    return;
  }

  mount.innerHTML = `
    <ul class="supporting-docs-list">
      ${visible
        .map((entry, i) => {
          const isImage = IMAGE_EXTENSIONS.has(extensionOf(entry.name));
          let thumbHtml = "";
          if (isImage) {
            const url = URL.createObjectURL(entry.file);
            currentThumbnailUrls.push(url);
            thumbHtml = `<img class="supporting-docs-thumb" src="${url}" alt="" />`;
          }
          const pathHtml = entry.relativePath
            ? `<span class="supporting-docs-path" title="${escapeHtml(entry.relativePath)}">${escapeHtml(entry.relativePath)}/</span>`
            : "";
          return `
        <li>
          ${thumbHtml}
          <span>${pathHtml}${escapeHtml(entry.name)}</span>
          <span class="supporting-docs-meta">${formatFileSizeInline(entry.size)} · ${new Date(entry.lastModified).toLocaleDateString("fr-CA")}</span>
          <button type="button" class="btn btn-secondary" data-supporting-doc-preview-idx="${i}" style="padding: 4px 10px; font-size: 0.8rem;">Aperçu</button>
          <button type="button" class="btn btn-secondary" data-supporting-doc-download-idx="${i}" style="padding: 4px 10px; font-size: 0.8rem;">Ouvrir</button>
        </li>
      `;
        })
        .join("")}
    </ul>
  `;

  mount.querySelectorAll("[data-supporting-doc-preview-idx]").forEach(btn => {
    const idx = Number(btn.getAttribute("data-supporting-doc-preview-idx"));
    btn.addEventListener("click", () => previewSupportingDocFile(visible[idx].handle));
  });
  mount.querySelectorAll("[data-supporting-doc-download-idx]").forEach(btn => {
    const idx = Number(btn.getAttribute("data-supporting-doc-download-idx"));
    btn.addEventListener("click", () => downloadSupportingDocFile(visible[idx].handle));
  });
}

function wireDropZone(dropzone: HTMLElement, folderHandle: any, act: any) {
  const defaultLabel = dropzone.textContent;
  dropzone.addEventListener("dragover", e => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-active"));
  dropzone.addEventListener("drop", async e => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    dropzone.textContent = "Ajout des fichiers en cours...";
    const result = await writeFilesToFolder(folderHandle, files);
    dropzone.textContent = defaultLabel;

    if (result.written > 0) showToast(`${result.written} fichier(s) ajouté(s) au dossier.`, "success");
    if (result.failed.length > 0) showToast(`Échec de l'ajout de : ${result.failed.join(", ")}`, "error");
    if (result.written > 0) renderSupportingDocsStatus(act);
  });
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
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="color: var(--text-muted);">Aucun dossier lié</span>
        <button type="button" class="btn btn-secondary" id="supporting-docs-link-btn" style="padding: 6px 12px; font-size: 0.85rem;">Lier un dossier</button>
      </div>
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
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="badge badge-warning">Autorisation requise</span>
        <button type="button" class="btn btn-primary" id="supporting-docs-authorize-btn" style="padding: 6px 12px; font-size: 0.85rem;">Autoriser l'accès</button>
        ${actionButtonsHtml()}
      </div>
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
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="color: var(--danger-text);">Impossible d'accéder au dossier « ${escapeHtml(resolved.name)} » : ${escapeHtml(e.message || e.name || "erreur inconnue")}</span>
        ${actionButtonsHtml()}
      </div>
    `;
    wireActionButtons(container, act);
    return;
  }

  if (document.getElementById(SUPPORTING_DOCS_CONTAINER_ID) !== container) return;

  const downloadAllBtnHtml =
    entries.length > 0
      ? `<button type="button" class="btn btn-secondary" id="supporting-docs-download-all-btn" style="padding: 6px 12px; font-size: 0.85rem;">Télécharger tout (ZIP)</button>`
      : "";

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
      <span class="badge badge-success">Dossier lié : ${escapeHtml(resolved.name)}</span>
      <button type="button" class="btn btn-secondary" id="supporting-docs-refresh-btn" style="padding: 6px 12px; font-size: 0.85rem;">Actualiser</button>
      ${downloadAllBtnHtml}
      ${actionButtonsHtml()}
    </div>
    <div class="supporting-docs-toolbar">
      <input type="search" id="supporting-docs-search" class="supporting-docs-search" placeholder="Rechercher un fichier..." />
      <select id="supporting-docs-sort" class="supporting-docs-sort">
        <option value="name-asc">Nom (A → Z)</option>
        <option value="name-desc">Nom (Z → A)</option>
        <option value="date-desc">Date (récent d'abord)</option>
        <option value="date-asc">Date (ancien d'abord)</option>
        <option value="size-desc">Taille (plus gros d'abord)</option>
        <option value="size-asc">Taille (plus petit d'abord)</option>
      </select>
    </div>
    <div id="supporting-docs-dropzone" class="supporting-docs-dropzone">Glissez-déposez des fichiers ici pour les ajouter au dossier</div>
    <div id="supporting-docs-list-mount"></div>
  `;

  wireActionButtons(container, act);
  container
    .querySelector("#supporting-docs-download-all-btn")
    ?.addEventListener("click", () => downloadFolderAsZip(resolved.name, entries));

  const listMount = container.querySelector("#supporting-docs-list-mount") as HTMLElement;
  const searchInput = container.querySelector("#supporting-docs-search") as HTMLInputElement;
  const sortSelect = container.querySelector("#supporting-docs-sort") as HTMLSelectElement;

  const rerenderList = () => renderEntryList(listMount, entries, searchInput.value, sortSelect.value as SortKey);
  searchInput.addEventListener("input", rerenderList);
  sortSelect.addEventListener("change", rerenderList);
  rerenderList();

  const dropzone = container.querySelector("#supporting-docs-dropzone") as HTMLElement;
  wireDropZone(dropzone, resolved.handle, act);
}

export { renderSupportingDocsStatus };
