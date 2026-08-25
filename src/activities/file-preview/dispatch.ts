/**
 * activities/file-preview/dispatch.ts - Trigger for the generic "Aperçu du fichier" modal: given
 * any File, hands it to components/modals/FilePreviewModal.tsx (React), which picks the right
 * viewer by extension and mounts it. Backs the pièces justificatives folder preview
 * (supporting-docs/actions.ts), but is deliberately not tied to activities so it can be reused
 * anywhere a File needs a quick look.
 *
 * Used to also hold the modal's own DOM wiring (close button/backdrop/Escape listeners, a download
 * handler) from before FilePreviewModal.tsx existed — all dead once it did: those ids
 * (#file-preview-modal, #file-preview-modal-close, #file-preview-download-btn) are not rendered by
 * the live app, so initFilePreviewModal() (called once from main.tsx) never had anything to attach
 * to. Its Escape-key handler was the only one attempting to close this modal externally, and
 * FilePreviewModal.tsx had none of its own — so pressing Escape while the modal was open silently
 * did nothing (the X button/backdrop click, both real React onClick handlers, were the only way to
 * close it). Fixed by giving FilePreviewModal.tsx its own Escape handler directly, same pattern as
 * CalendarModal.tsx; this file now only holds the open trigger, which already correctly delegates.
 */
import { triggerOpenFilePreviewModal } from "../../components/modals/FilePreviewModal.tsx";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

async function openFilePreviewModal(file: File): Promise<void> {
  triggerOpenFilePreviewModal(file);
}

export { openFilePreviewModal, IMAGE_EXTENSIONS };
