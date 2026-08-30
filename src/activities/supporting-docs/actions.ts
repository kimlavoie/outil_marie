/**
 * activities/supporting-docs/actions.ts - File System Access API workflows for linking a whole
 * folder of pièces justificatives to an activity: picking/relinking the folder, resolving its
 * handle (with permission re-check), recursively listing its files, previewing/downloading one,
 * writing dropped files into it (drag-and-drop upload, which upgrades the stored handle's
 * permission from read to readwrite on demand), and unlinking. Split out of index.ts, mirroring
 * file-links/actions.ts but for a directory instead of a single file.
 */
import { getActivityById } from "../../state/activities-repository.ts";
import { generateUid, showToast } from "../../utils/utils.ts";
import { commitActivityPatch } from "../form-state-bar.ts";
import { idbSetSupportingDocsFolder, idbGetSupportingDocsFolder } from "./db.ts";
import { renderSupportingDocsStatus } from "./status.ts";
import { openFilePreviewModal } from "../file-preview/dispatch.ts";

interface SupportingDocEntry {
  name: string;
  // Path of the sub-folder containing this file, relative to the linked root ("" for a file
  // directly inside it, "Factures/2026" for one nested two levels deep). Display-only — handle
  // and file already point at the right place regardless of nesting.
  relativePath: string;
  size: number;
  lastModified: number;
  handle: any;
  // Kept alongside the handle (rather than re-reading via getFile()) so status.ts can build an
  // image thumbnail without a second disk read of the same file.
  file: File;
}

// Lets the user pick a folder on disk and links it (via the File System Access API) to the given
// activity's pièces justificatives — read-only, only stores a reference so the user can browse
// and open the files it contains later.
async function pickAndLinkFolder(activityId: string) {
  if (!window.showDirectoryPicker) {
    showToast("Le lien de dossier nécessite un navigateur compatible avec l'API File System Access (Chrome ou Edge).", "warning");
    return;
  }
  let handle;
  try {
    handle = await window.showDirectoryPicker({ mode: "read" });
  } catch {
    return;
  }

  const linkId = generateUid("supportingdocs");
  await idbSetSupportingDocsFolder(linkId, { handle, name: handle.name });

  commitActivityPatch(activityId, (act: any) => {
    act.supporting_docs.folder_link_id = linkId;
    act.supporting_docs.linked_at = new Date().toISOString().split("T")[0];
  });
  const updated = getActivityById(activityId);
  if (updated) renderSupportingDocsStatus(updated);
}

// Resolves the stored handle for a link id and makes sure read permission is (still) granted,
// re-requesting it if needed. Returns null (no toast) if the link is missing or permission isn't
// granted — status.ts renders the "Autoriser l'accès" state instead.
async function resolveFolderHandle(linkId: string): Promise<{ handle: any; name: string } | null> {
  const record = await idbGetSupportingDocsFolder(linkId);
  if (!record) return null;

  let perm = await record.handle.queryPermission({ mode: "read" });
  if (perm !== "granted") perm = await record.handle.requestPermission({ mode: "read" });
  if (perm !== "granted") return null;

  return { handle: record.handle, name: record.name };
}

// Lists every file inside a folder handle, recursing into sub-folders (their contents are
// relevant pièces justificatives too — e.g. "Factures/2026/" — just tagged with relativePath so
// the UI can show where they live). Depth-limited so a symlink loop or an unexpectedly deep tree
// can't hang the drawer.
const MAX_RECURSION_DEPTH = 8;

async function listFolderEntries(handle: any, relativePath = "", depth = 0): Promise<SupportingDocEntry[]> {
  const entries: SupportingDocEntry[] = [];
  if (depth > MAX_RECURSION_DEPTH) return entries;

  for await (const child of handle.values()) {
    if (child.kind === "directory") {
      const childPath = relativePath ? `${relativePath}/${child.name}` : child.name;
      entries.push(...(await listFolderEntries(child, childPath, depth + 1)));
      continue;
    }
    const file = await child.getFile();
    entries.push({ name: file.name, relativePath, size: file.size, lastModified: file.lastModified, handle: child, file });
  }
  entries.sort((a, b) => (a.relativePath + "/" + a.name).localeCompare(b.relativePath + "/" + b.name, "fr"));
  return entries;
}

// "Aperçu" — opens the file in-app via the generic preview modal (dispatch.ts).
async function previewSupportingDocFile(fileHandle: any) {
  try {
    const file = await fileHandle.getFile();
    await openFilePreviewModal(file);
  } catch (e: any) {
    showToast("Impossible d'afficher l'aperçu : " + e.message, "error");
  }
}

// "Ouvrir" — downloads the file as-is, in its native format (no in-app rendering).
async function downloadSupportingDocFile(fileHandle: any) {
  try {
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    showToast("Impossible d'ouvrir le fichier : " + e.message, "error");
  }
}

// "Télécharger tout (ZIP)" — bundles every file already listed (no extra disk read, same File
// objects as the on-screen list) into a single .zip and downloads it. jszip is dynamically
// imported so it only loads when this is actually used, same as pdfjs-dist/xlsx/docx-preview.
async function downloadFolderAsZip(folderName: string, entries: SupportingDocEntry[]) {
  if (entries.length === 0) return;

  try {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    entries.forEach(entry => zip.file(entry.name, entry.file));
    const blob = await zip.generateAsync({ type: "blob" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    showToast("Impossible de générer le fichier ZIP : " + e.message, "error");
  }
}

// Writes dropped files into the root of the linked folder (drag-and-drop upload). Requires
// upgrading the stored handle's permission from "read" to "readwrite" — the browser prompts the
// user for that the first time; if refused, nothing is written. Existing files with the same name
// are overwritten (createWritable() truncates), matching how a real file-explorer drop behaves.
async function writeFilesToFolder(handle: any, files: File[]): Promise<{ written: number; failed: string[] }> {
  let perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") perm = await handle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    showToast("Permission d'écriture refusée : impossible d'ajouter les fichiers au dossier.", "warning");
    return { written: 0, failed: files.map(f => f.name) };
  }

  let written = 0;
  const failed: string[] = [];
  for (const file of files) {
    try {
      const fileHandle = await handle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      written++;
    } catch {
      failed.push(file.name);
    }
  }
  return { written, failed };
}

function unlinkFolder(activityId: string) {
  commitActivityPatch(activityId, (act: any) => {
    act.supporting_docs.folder_link_id = "";
    act.supporting_docs.linked_at = "";
  });
  showToast("Le lien vers le dossier a été retiré.", "success");
  const updated = getActivityById(activityId);
  if (updated) renderSupportingDocsStatus(updated);
}

export {
  pickAndLinkFolder,
  resolveFolderHandle,
  listFolderEntries,
  previewSupportingDocFile,
  downloadSupportingDocFile,
  downloadFolderAsZip,
  writeFilesToFolder,
  unlinkFolder
};
export type { SupportingDocEntry };
