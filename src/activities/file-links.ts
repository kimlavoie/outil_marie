/**
 * activities-file-links.ts - Linking an activity submission/contract/form to a file on disk via
 * the File System Access API (Chrome/Edge only), and the resulting status UI.
 *
 * Renders into #submission-file-status/#contract-file-status/#form-file-status, containers that
 * live inside the activity form/drawer — so like js/datepicker.ts and js/activities-form.ts, this
 * stays a plain TS module (Phase 2 style) rather than a React component until Réservations gets
 * its own turn.
 */
import { appState } from "../state/state.ts";
import { openVersionedDb } from "../state/db-utils.ts";
import { generateUid, showToast, escapeHtml } from "../utils/utils.ts";
import { commitActivityPatch } from "./form.ts";
import { deriveActivityState } from "./render.ts";
import { generateContractXlsx } from "../services/contract-generator.ts";

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
// the given activity's submission/contract/form — this only stores a reference to a file the
// user produced manually (or downloaded via generateContractXlsx()), so they can reopen it (and,
// for submission/contract, mark the activity Soumise/Approuvée).
async function pickAndLinkFile(activityId: string, kind: "submission" | "contract" | "form") {
  if (!window.showOpenFilePicker) {
    showToast("Le lien de fichier nécessite un navigateur compatible avec l'API File System Access (Chrome ou Edge).", "warning");
    return;
  }
  let pickerOptions: any = {};
  if (kind === "form") {
    pickerOptions = {
      types: [
        {
          description: "Documents PDF (*.pdf)",
          accept: {
            "application/pdf": [".pdf"]
          }
        }
      ],
      excludeAcceptAllOption: true
    };
  }
  let handle;
  try {
    [handle] = await (window as any).showOpenFilePicker(pickerOptions);
  } catch {
    return; // user cancelled the picker
  }

  if (kind === "form" && !handle.name.toLowerCase().endsWith(".pdf")) {
    showToast("Le fichier sélectionné doit être un document PDF.", "error");
    return;
  }

  const linkId = generateUid("filelink");
  await idbSetFileLink(linkId, { handle, name: handle.name });

  commitActivityPatch(activityId, (act: any) => {
    act[kind].file_link_id = linkId;
    if (kind === "submission") act.submission.generated_at = new Date().toISOString().split("T")[0];
    if (kind === "form") act.form.linked_at = new Date().toISOString().split("T")[0];
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

const FILE_STATUS_CONTAINER_IDS: Record<"submission" | "contract" | "form", string> = {
  submission: "submission-file-status",
  contract: "contract-file-status",
  form: "form-file-status"
};

// Renders the "Lier un fichier / Ouvrir / Changer" status row plus, for submission/contract, the
// relevant state transition button (Marquer comme Soumise au client / Marquer comme Approuvée).
// The "form" kind (formulaire PDF lié à la réservation) has no state transition of its own.
function renderFileLinkStatus(kind: "submission" | "contract" | "form", act: any) {
  const container = document.getElementById(FILE_STATUS_CONTAINER_IDS[kind]);
  if (!container) return;

  const linkId = act[kind].file_link_id;
  const linkedLabel = linkId
    ? `<span class="badge badge-success">Fichier lié</span>`
    : `<span style="color: var(--text-muted);">Aucun fichier lié</span>`;

  let transitionBtnHtml = "";
  if (kind === "submission") {
    const sent = act.submission.sent_at;
    transitionBtnHtml = `<button type="button" id="mark-submitted-btn" class="btn ${sent ? "btn-secondary" : "btn-primary"}">${sent ? "Annuler Soumise au client" : "Marquer comme Soumise au client"}</button>`;
    document.getElementById("accordion-check-submission-file")?.classList.toggle("complete", !!sent);
  } else if (kind === "contract") {
    const approved = act.contract.approved_at;
    transitionBtnHtml = `<button type="button" id="mark-approved-btn" class="btn ${approved ? "btn-secondary" : "btn-primary"}">${approved ? "Annuler Approuvée" : "Marquer comme Approuvée"}</button>`;
    document.getElementById("accordion-check-contract-file")?.classList.toggle("complete", !!approved);
  }

  const generateContractBtnHtml =
    kind === "contract"
      ? `<button type="button" class="btn btn-secondary" id="contract-generate-btn" style="padding: 6px 12px; font-size: 0.85rem;">Générer le contrat (xlsx)</button>`
      : "";

  container.innerHTML = `
    ${linkedLabel}
    ${generateContractBtnHtml}
    <button type="button" class="btn btn-secondary" id="${kind}-link-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">${linkId ? "Changer le fichier lié" : "Lier un fichier"}</button>
    ${linkId ? `<button type="button" class="btn btn-secondary" id="${kind}-open-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">Ouvrir</button>` : ""}
    ${transitionBtnHtml}
  `;

  container.querySelector(`#${kind}-link-file-btn`)!.addEventListener("click", () => pickAndLinkFile(act.id, kind));
  const openBtn = container.querySelector(`#${kind}-open-file-btn`);
  if (openBtn) openBtn.addEventListener("click", () => openLinkedFile(linkId));
  const generateBtn = container.querySelector("#contract-generate-btn");
  if (generateBtn) generateBtn.addEventListener("click", () => generateContractXlsx(act));

  if (kind === "submission") {
    const btn = container.querySelector<HTMLButtonElement>("#mark-submitted-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        commitActivityPatch(act.id, (a: any) => {
          if (a.submission.sent_at) {
            a.submission.sent_at = "";
          } else {
            a.mode = "soumission";
            a.submission.sent_at = new Date().toISOString().split("T")[0];
          }
          a.state = deriveActivityState(a);
        });
        const updated = appState.activities.find((a: any) => a.id === act.id);
        renderFileLinkStatus("submission", updated);
        renderFileLinkStatus("contract", updated);
      });
    }
  } else if (kind === "contract") {
    const btn = container.querySelector<HTMLButtonElement>("#mark-approved-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        commitActivityPatch(act.id, (a: any) => {
          a.contract.approved_at = a.contract.approved_at ? "" : new Date().toISOString().split("T")[0];
          a.state = deriveActivityState(a);
        });
        const updated = appState.activities.find((a: any) => a.id === act.id);
        renderFileLinkStatus("submission", updated);
        renderFileLinkStatus("contract", updated);
      });
    }
  }
  if (kind === "form") {
    renderPdfPreview(act);
  }
}

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
    let perm = await record.handle.queryPermission({ mode: "read" });
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
      
      const url = URL.createObjectURL(file);
      previewContainer.innerHTML = `
        <div class="pdf-preview-wrapper">
          <div class="pdf-preview-header">
            <div class="pdf-preview-title">
              <svg viewBox="0 0 24 24" class="pdf-file-icon"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h2c.83 0 1.5.67 1.5 1.5v3.5zm4-3.25c0 .41-.34.75-.75.75H19v1h.75c.41 0 .75.34.75.75s-.34.75-.75.75H19v1.25c0 .41-.34.75-.75.75s-.75-.34-.75-.75V8c0-.55.45-1 1-1h2c.41 0 .75.34.75.75zM3 6c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h13c.55 0 1-.45 1-1s-.45-1-1-1H5c-.55 0-1-.45-1-1V7c0-.55-.45-1-1-1z"/></svg>
              <span>${escapeHtml(record.name)}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-new-tab" style="padding: 4px 8px; font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41 9.83-9.83V9h2V3h-6z"/></svg>
              Ouvrir dans un nouvel onglet
            </button>
          </div>
          <iframe src="${url}" class="pdf-viewer-frame" width="100%" height="500px"></iframe>
        </div>
      `;
      previewContainer.querySelector("#btn-pdf-new-tab")!.addEventListener("click", () => {
        window.open(url, "_blank");
      });
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
        let newPerm = await record.handle.requestPermission({ mode: "read" });
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

export { renderFileLinkStatus, pickAndLinkFile, openLinkedFile, renderPdfPreview };
