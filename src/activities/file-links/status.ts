/**
 * activities/file-links/status.ts - The "Lier un fichier / Ouvrir / Changer" status row (plus the
 * submission/contract state-transition button and inline preview toggle) shown for each of the
 * submission/contract/form file links. Split out of index.ts (see that file for why it stays
 * a barrel importing/re-exporting this alongside db.ts/actions.ts/preview.ts).
 */
import { appState } from "../../state/state.ts";
import { commitActivityPatch } from "../form.ts";
import { deriveActivityState } from "../render.ts";
import { autoSaveActivityForm } from "../financials.ts";
import { pickAndLinkFile, openLinkedFile, unlinkFile, generateAndLinkFile } from "./actions.ts";
import { renderPdfPreview, renderXlsxPreview, XLSX_PREVIEW_CONTAINER_IDS } from "./preview.ts";

const FILE_STATUS_CONTAINER_IDS: Record<"submission" | "contract" | "form", string> = {
  submission: "submission-file-status",
  contract: "contract-file-status",
  form: "form-file-status"
};

// Which submission/contract previews are currently expanded, keyed by "kind:activityId" — the
// preview is collapsed by default, and rendering it (parsing + laying out the xlsx table) only
// happens once the user opts in, so it's tracked instead of just toggling a CSS class.
const expandedXlsxPreviews = new Set<string>();

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

  const generateSoumissionBtnHtml =
    kind === "submission"
      ? `<button type="button" class="btn btn-secondary" id="submission-generate-btn" style="padding: 6px 12px; font-size: 0.85rem;">Générer la soumission (xlsx)</button>`
      : "";

  const previewKey = `${kind}:${act.id}`;
  const previewExpanded = kind !== "form" && expandedXlsxPreviews.has(previewKey);
  const previewToggleBtnHtml =
    linkId && kind !== "form"
      ? `<button type="button" class="btn btn-secondary" id="${kind}-toggle-preview-btn" style="padding: 6px 12px; font-size: 0.85rem;">${previewExpanded ? "Masquer l'aperçu" : "Afficher l'aperçu"}</button>`
      : "";

  container.innerHTML = `
    ${linkedLabel}
    ${generateContractBtnHtml}
    ${generateSoumissionBtnHtml}
    <button type="button" class="btn btn-secondary" id="${kind}-link-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">${linkId ? "Changer le fichier lié" : "Lier un fichier"}</button>
    ${linkId ? `<button type="button" class="btn btn-secondary" id="${kind}-open-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">Ouvrir</button>` : ""}
    ${previewToggleBtnHtml}
    ${linkId ? `<button type="button" class="btn btn-danger" id="${kind}-unlink-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">Retirer le lien</button>` : ""}
    ${transitionBtnHtml}
  `;

  container.querySelector(`#${kind}-link-file-btn`)!.addEventListener("click", () => pickAndLinkFile(act.id, kind));
  const openBtn = container.querySelector(`#${kind}-open-file-btn`);
  if (openBtn) openBtn.addEventListener("click", () => openLinkedFile(linkId));
  const unlinkBtn = container.querySelector(`#${kind}-unlink-file-btn`);
  if (unlinkBtn) unlinkBtn.addEventListener("click", () => unlinkFile(act.id, kind));
  const toggleBtn = container.querySelector(`#${kind}-toggle-preview-btn`);
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (expandedXlsxPreviews.has(previewKey)) {
        expandedXlsxPreviews.delete(previewKey);
      } else {
        expandedXlsxPreviews.add(previewKey);
      }
      renderFileLinkStatus(kind, act);
    });
  }
  const generateBtn = container.querySelector("#contract-generate-btn");
  if (generateBtn) {
    // Persist whatever's currently on the form first — otherwise the contract would be built
    // from the last-saved record and silently miss any not-yet-saved room price/reservation edit.
    generateBtn.addEventListener("click", async () => {
      autoSaveActivityForm();
      const freshAct = appState.activities.find((a: any) => a.id === act.id) || act;
      await generateAndLinkFile(freshAct, "contract");
    });
  }
  const generateSoumissionBtn = container.querySelector("#submission-generate-btn");
  if (generateSoumissionBtn) {
    generateSoumissionBtn.addEventListener("click", async () => {
      autoSaveActivityForm();
      const freshAct = appState.activities.find((a: any) => a.id === act.id) || act;
      await generateAndLinkFile(freshAct, "submission");
    });
  }

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
  } else {
    const previewContainer = document.getElementById(XLSX_PREVIEW_CONTAINER_IDS[kind]);
    if (previewExpanded) {
      if (previewContainer) previewContainer.style.display = "";
      renderXlsxPreview(kind, act);
    } else if (previewContainer) {
      previewContainer.style.display = "none";
      previewContainer.innerHTML = "";
    }
  }
}

export { FILE_STATUS_CONTAINER_IDS, expandedXlsxPreviews, renderFileLinkStatus };
