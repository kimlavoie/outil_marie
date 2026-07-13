/**
 * activities/file-preview/docx-viewer.ts - Word (.docx) preview for the generic file preview modal
 * (see dispatch.ts).
 *
 * Uses docx-preview rather than mammoth: mammoth deliberately produces "semantic" HTML and drops
 * most direct/manual formatting (text color, background/highlight color, font, etc.), which made
 * the preview visibly poorer than the source document. docx-preview instead renders the actual
 * page layout with inline styles for direct formatting, which is what an "aperçu" of a pièce
 * justificative needs to look like the real thing. Only ever reached via dynamic import from
 * dispatch.ts, so it stays out of the main bundle.
 */
async function renderDocxPreview(mount: HTMLElement, buffer: ArrayBuffer): Promise<void> {
  const { renderAsync } = await import("docx-preview");

  mount.innerHTML = `<div class="docx-preview-page"><div class="docx-preview-content"></div></div>`;
  const contentEl = mount.querySelector(".docx-preview-content") as HTMLElement;

  await renderAsync(buffer, contentEl, contentEl, {
    className: "docx-preview-doc",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true
  });
}

export { renderDocxPreview };
