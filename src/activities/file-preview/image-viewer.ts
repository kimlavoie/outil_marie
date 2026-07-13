/**
 * activities/file-preview/image-viewer.ts - Image preview (.png, .jpg, .jpeg, .gif, .webp, .bmp,
 * .svg) for the generic file preview modal (see dispatch.ts). The created object URL is returned
 * so the caller can revoke it when the modal closes.
 */
import { escapeHtml } from "../../utils/utils.ts";

function renderImagePreview(mount: HTMLElement, file: File, fileName: string): string {
  const url = URL.createObjectURL(file);
  mount.innerHTML = `
    <div class="image-preview-wrapper">
      <img class="image-preview-content" src="${url}" alt="${escapeHtml(fileName)}" />
    </div>
  `;
  return url;
}

export { renderImagePreview };
