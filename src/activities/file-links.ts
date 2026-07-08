/**
 * activities-file-links.ts - Linking an activity submission/contract to a file on disk via
 * the File System Access API (Chrome/Edge only), and the resulting status UI.
 *
 * Renders into #submission-file-status/#contract-file-status, containers that live inside the
 * activity form/drawer — so like js/datepicker.ts and js/activities-form.ts, this stays a plain
 * TS module (Phase 2 style) rather than a React component until Réservations gets its own turn.
 */
import { appState } from "../state/state.js";
import { openVersionedDb } from "../state/db-utils.ts";
import { generateUid, showToast } from "../utils/utils.ts";
import { commitActivityPatch } from "./form.ts";

const FILE_LINKS_DB_NAME = "outil_marie_file_links";
const FILE_LINKS_STORE_NAME = "links";
const FILE_LINKS_DB_VERSION = 1;

function upgradeFileLinksDb(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(FILE_LINKS_STORE_NAME)) {
    db.createObjectStore(FILE_LINKS_STORE_NAME);
  }
}

function openFileLinksDb() {
  return openVersionedDb(FILE_LINKS_DB_NAME, FILE_LINKS_DB_VERSION, upgradeFileLinksDb);
}

async function idbSetFileLink(id: string, record: any) {
  const db = await openFileLinksDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_LINKS_STORE_NAME, "readwrite");
    tx.objectStore(FILE_LINKS_STORE_NAME).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetFileLink(id: string): Promise<{ handle: any; name: string } | null> {
  const db = await openFileLinksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_LINKS_STORE_NAME, "readonly");
    const req = tx.objectStore(FILE_LINKS_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Lets the user pick an existing file on disk and links it (via the File System Access API) to
// the given activity's submission/contract. Excel *generation* is deferred until the submission/
// contract templates are provided — this only stores a reference to a file the user produced
// manually, so they can reopen it and mark the activity Soumise/Approuvée.
async function pickAndLinkFile(activityId: string, kind: "submission" | "contract") {
  if (!window.showOpenFilePicker) {
    showToast("Le lien de fichier nécessite un navigateur compatible avec l'API File System Access (Chrome ou Edge).", "warning");
    return;
  }
  let handle;
  try {
    [handle] = await window.showOpenFilePicker();
  } catch {
    return; // user cancelled the picker
  }

  const linkId = generateUid("filelink");
  await idbSetFileLink(linkId, { handle, name: handle.name });

  commitActivityPatch(activityId, (act: any) => {
    act[kind].file_link_id = linkId;
    if (kind === "submission") act.submission.generated_at = new Date().toISOString().split("T")[0];
  });
  renderFileLinkStatus(
    kind,
    appState.activities.find((a: any) => a.id === activityId)
  );
}

async function openLinkedFile(linkId: string) {
  const record = await idbGetFileLink(linkId);
  if (!record) {
    showToast("Fichier introuvable (peut-être lié depuis un autre appareil).", "error");
    return;
  }
  try {
    let perm = await record.handle.queryPermission({ mode: "read" });
    if (perm !== "granted") perm = await record.handle.requestPermission({ mode: "read" });
    if (perm !== "granted") {
      showToast("Permission refusée pour ouvrir ce fichier.", "error");
      return;
    }
    const file = await record.handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
  } catch (e: any) {
    showToast("Impossible d'ouvrir le fichier : " + e.message, "error");
  }
}

// Renders the "Lier un fichier / Ouvrir / Changer" status row plus the relevant state
// transition button (Marquer comme Soumise au client / Marquer comme Approuvée).
function renderFileLinkStatus(kind: "submission" | "contract", act: any) {
  const container = document.getElementById(kind === "submission" ? "submission-file-status" : "contract-file-status");
  if (!container) return;

  const linkId = act[kind].file_link_id;
  const linkedLabel = linkId
    ? `<span class="badge badge-success">Fichier lié</span>`
    : `<span style="color: var(--text-muted);">Aucun fichier lié</span>`;

  let transitionBtnHtml = "";
  if (kind === "submission") {
    const canSubmit = !!linkId && act.state === "brouillon";
    transitionBtnHtml = `<button type="button" id="mark-submitted-btn" class="btn btn-primary" ${canSubmit ? "" : "disabled"}>Marquer comme Soumise au client</button>`;
  } else {
    const canApprove = !!linkId && act.state === "soumise";
    transitionBtnHtml = `<button type="button" id="mark-approved-btn" class="btn btn-primary" ${canApprove ? "" : "disabled"}>Marquer comme Approuvée</button>`;
  }

  container.innerHTML = `
    ${linkedLabel}
    <button type="button" class="btn btn-secondary" id="${kind}-link-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">${linkId ? "Changer le fichier lié" : "Lier un fichier"}</button>
    ${linkId ? `<button type="button" class="btn btn-secondary" id="${kind}-open-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">Ouvrir</button>` : ""}
    ${transitionBtnHtml}
  `;

  container.querySelector(`#${kind}-link-file-btn`)!.addEventListener("click", () => pickAndLinkFile(act.id, kind));
  const openBtn = container.querySelector(`#${kind}-open-file-btn`);
  if (openBtn) openBtn.addEventListener("click", () => openLinkedFile(linkId));

  if (kind === "submission") {
    const btn = container.querySelector<HTMLButtonElement>("#mark-submitted-btn");
    if (btn && !btn.disabled) {
      btn.addEventListener("click", () => {
        commitActivityPatch(act.id, (a: any) => {
          a.state = "soumise";
          a.mode = "soumission";
          a.submission.sent_at = new Date().toISOString().split("T")[0];
        });
        const updated = appState.activities.find((a: any) => a.id === act.id);
        renderFileLinkStatus("submission", updated);
        renderFileLinkStatus("contract", updated);
      });
    }
  } else {
    const btn = container.querySelector<HTMLButtonElement>("#mark-approved-btn");
    if (btn && !btn.disabled) {
      btn.addEventListener("click", () => {
        commitActivityPatch(act.id, (a: any) => {
          a.state = "approuvee";
          a.contract.approved_at = new Date().toISOString().split("T")[0];
        });
        const updated = appState.activities.find((a: any) => a.id === act.id);
        renderFileLinkStatus("submission", updated);
        renderFileLinkStatus("contract", updated);
      });
    }
  }
}

export { renderFileLinkStatus, pickAndLinkFile, openLinkedFile };
