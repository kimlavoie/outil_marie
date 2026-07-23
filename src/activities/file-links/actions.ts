/**
 * activities/file-links/actions.ts - File System Access API workflows: picking/generating a file
 * and linking it to an activity, opening a previously-linked file, and removing a link. Split out
 * of index.ts (see that file for why it stays a barrel importing/re-exporting this alongside
 * db.ts/status.ts/preview.ts).
 */
import { appState } from "../../state/state.ts";
import { generateUid, showToast } from "../../utils/utils.ts";
import { commitActivityPatch } from "../form.ts";
import { deriveActivityState } from "../render.ts";
import { generateContractXlsx, generateSoumissionXlsx } from "../../services/contract-generator.ts";
import { idbSetFileLink, idbGetFileLink } from "./db.ts";
import { renderFileLinkStatus, expandedXlsxPreviews } from "./status.ts";

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
    return;
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

async function generateAndLinkFile(act: any, kind: "contract" | "submission") {
  const prefix = kind === "contract" ? "contrat" : "soumission";
  let dateStr = "";
  if (act.date_start && /^\d{4}-\d{2}-\d{2}$/.test(act.date_start)) {
    dateStr = act.date_start.replace(/-/g, "_");
  } else {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    dateStr = `${yyyy}_${mm}_${dd}`;
  }
  const filename = `${prefix}_${dateStr}_${(act.name || "activite").replace(/[^\w-]+/g, "_")}.xlsx`;

  if ((window as any).showSaveFilePicker) {
    let handle;
    try {
      handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Fichier Excel (*.xlsx)",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
            }
          }
        ],
        excludeAcceptAllOption: true
      });
    } catch {
      return;
    }

    let result;
    try {
      if (kind === "contract") {
        result = await generateContractXlsx(act);
      } else {
        result = await generateSoumissionXlsx(act);
      }
    } catch (err: any) {
      showToast("Erreur lors de la génération : " + err.message, "error");
      return;
    }

    if (!result) return;

    try {
      const writable = await handle.createWritable();
      await writable.write(result.blob);
      await writable.close();
    } catch (err: any) {
      showToast("Impossible d'écrire le fichier sur le disque : " + err.message, "error");
      return;
    }

    const linkId = generateUid("filelink");
    await idbSetFileLink(linkId, { handle, name: handle.name });

    commitActivityPatch(act.id, (a: any) => {
      a[kind].file_link_id = linkId;
      if (kind === "submission") {
        a.submission.generated_at = new Date().toISOString().split("T")[0];
      }
    });

    showToast(kind === "contract" ? "Contrat généré et lié avec succès !" : "Soumission générée et liée avec succès !", "success");

    const updated = appState.activities.find((a: any) => a.id === act.id) || act;
    renderFileLinkStatus(kind, updated);
  } else {
    let result;
    try {
      if (kind === "contract") {
        result = await generateContractXlsx(act);
      } else {
        result = await generateSoumissionXlsx(act);
      }
    } catch (err: any) {
      showToast("Erreur lors de la génération : " + err.message, "error");
      return;
    }

    if (!result) return;

    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast("Fichier généré et téléchargé (la liaison automatique nécessite Chrome ou Edge).", "warning");
  }
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

async function unlinkFile(activityId: string, kind: "submission" | "contract" | "form") {
  commitActivityPatch(activityId, (act: any) => {
    act[kind].file_link_id = "";
    if (kind === "submission") {
      act.submission.generated_at = "";
      act.submission.sent_at = "";
    } else if (kind === "contract") {
      act.contract.approved_at = "";
    } else if (kind === "form") {
      act.form.linked_at = "";
    }
    act.state = deriveActivityState(act);
  });
  if (kind === "submission" || kind === "contract") {
    expandedXlsxPreviews.delete(`${kind}:${activityId}`);
  }
  showToast("Le lien vers le fichier a été retiré.", "success");
  const updated = appState.activities.find((a: any) => a.id === activityId);
  if (updated) {
    renderFileLinkStatus(kind, updated);
    if (kind === "submission" || kind === "contract") {
      renderFileLinkStatus("submission", updated);
      renderFileLinkStatus("contract", updated);
    }
  }
}

export { pickAndLinkFile, generateAndLinkFile, openLinkedFile, unlinkFile };
