import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { escapeHtml } from "../utils/utils.ts";

// Initialize the PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerURL;

export class PdfViewer {
  private container: HTMLElement;
  private pdfDoc: any = null;
  private pageNum: number = 1;
  private scale: number = 1.0;
  private pageRendering: boolean = false;
  private pageNumPending: number | null = null;
  private arrayBuffer: ArrayBuffer;
  private fileName: string;
  private isFullscreen: boolean = false;

  // DOM Elements
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private viewportContainer: HTMLElement | null = null;
  private pageIndicator: HTMLElement | null = null;
  private zoomIndicator: HTMLElement | null = null;
  private prevButton: HTMLButtonElement | null = null;
  private nextButton: HTMLButtonElement | null = null;
  private viewerEl: HTMLElement | null = null;

  constructor(container: HTMLElement, arrayBuffer: ArrayBuffer, fileName: string) {
    this.container = container;
    this.arrayBuffer = arrayBuffer;
    this.fileName = fileName;
  }

  /**
   * Initializes the PDF viewer, builds layout, binds event handlers, and loads the document.
   */
  public async init() {
    this.renderLayout();
    this.bindEvents();

    try {
      this.showLoading();

      const loadingTask = pdfjsLib.getDocument({ data: this.arrayBuffer });
      this.pdfDoc = await loadingTask.promise;

      this.hideLoading();
      this.pageNum = 1;

      // Auto-fit to width initially
      await this.fitToWidth();
    } catch (error: any) {
      console.error("PDF loading error:", error);
      this.showError(`Impossible de charger le PDF: ${error.message}`);
    }
  }

  /**
   * Renders the HTML structure for the custom PDF viewer.
   */
  private renderLayout() {
    this.container.innerHTML = `
      <div class="pdf-custom-viewer" tabindex="0">
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-group">
            <button type="button" class="btn btn-secondary btn-sm" id="pdf-prev-page" title="Page précédente" disabled>
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <span class="pdf-page-indicator" id="pdf-page-num-display">Page -- / --</span>
            <button type="button" class="btn btn-secondary btn-sm" id="pdf-next-page" title="Page suivante" disabled>
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>
          <div class="pdf-toolbar-group">
            <button type="button" class="btn btn-secondary btn-sm" id="pdf-zoom-out" title="Zoom arrière">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M19 13H5v-2h14v2z"/></svg>
            </button>
            <span class="pdf-zoom-indicator" id="pdf-zoom-percent">100%</span>
            <button type="button" class="btn btn-secondary btn-sm" id="pdf-zoom-in" title="Zoom avant">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="pdf-zoom-fit" title="Ajuster à la largeur">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M4 6v12h2V6H4zm14 0v12h2V6h-2zm-2 5H8V9l-3 3 3 3v-2h8v2l3-3-3-3v2z"/></svg>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="pdf-toggle-fullscreen" title="Pseudo plein écran">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
          </div>
          <div class="pdf-toolbar-group">
            <button type="button" class="btn btn-primary btn-sm" id="pdf-download" title="Télécharger le fichier PDF" style="display: flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
              <span>Télécharger</span>
            </button>
          </div>
        </div>
        <div class="pdf-viewport" id="pdf-viewport-container">
          <div class="pdf-canvas-container">
            <canvas id="pdf-render-canvas"></canvas>
          </div>
        </div>
      </div>
    `;

    this.viewerEl = this.container.querySelector(".pdf-custom-viewer");
    this.canvas = this.container.querySelector("#pdf-render-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d");
    this.viewportContainer = this.container.querySelector("#pdf-viewport-container");
    this.pageIndicator = this.container.querySelector("#pdf-page-num-display");
    this.zoomIndicator = this.container.querySelector("#pdf-zoom-percent");
    this.prevButton = this.container.querySelector("#pdf-prev-page") as HTMLButtonElement;
    this.nextButton = this.container.querySelector("#pdf-next-page") as HTMLButtonElement;
  }

  /**
   * Binds user event listeners.
   */
  private bindEvents() {
    this.prevButton?.addEventListener("click", () => this.onPrevPage());
    this.nextButton?.addEventListener("click", () => this.onNextPage());

    this.container.querySelector("#pdf-zoom-out")?.addEventListener("click", () => this.onZoomOut());
    this.container.querySelector("#pdf-zoom-in")?.addEventListener("click", () => this.onZoomIn());
    this.container.querySelector("#pdf-zoom-fit")?.addEventListener("click", () => this.fitToWidth());
    this.container.querySelector("#pdf-toggle-fullscreen")?.addEventListener("click", () => this.toggleFullscreen());

    this.container.querySelector("#pdf-download")?.addEventListener("click", () => this.downloadPdf());

    // Arrow key page switching when the viewer container has keyboard focus
    this.viewerEl?.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
          return; // Avoid stealing keystrokes when the user is typing in a text field
        }
        e.preventDefault();
        if (e.key === "ArrowLeft") {
          this.onPrevPage();
        } else {
          this.onNextPage();
        }
      }
    });

    // Auto-focus the viewer container on click so it receives keyboard focus
    this.viewerEl?.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      // Do not disrupt focus if the user clicks a button, input, or select element
      if (!target.closest("button") && !target.closest("input") && !target.closest("select")) {
        this.viewerEl?.focus();
      }
    });
  }

  /**
   * Displays loading state in the viewport.
   */
  private showLoading() {
    if (this.viewportContainer) {
      const loader = document.createElement("div");
      loader.className = "pdf-loading-spinner";
      loader.innerHTML = `
        <div class="spinner" style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="color: #fff; margin-top: 12px; font-size: 0.9rem;">Chargement du document...</p>
        <style>
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      `;
      // Temporarily hide the canvas container while loading
      const canvasContainer = this.viewportContainer.querySelector(".pdf-canvas-container") as HTMLElement;
      if (canvasContainer) canvasContainer.style.display = "none";
      this.viewportContainer.appendChild(loader);
    }
  }

  /**
   * Hides loading state.
   */
  private hideLoading() {
    if (this.viewportContainer) {
      const loader = this.viewportContainer.querySelector(".pdf-loading-spinner");
      if (loader) loader.remove();

      const canvasContainer = this.viewportContainer.querySelector(".pdf-canvas-container") as HTMLElement;
      if (canvasContainer) canvasContainer.style.display = "block";
    }
  }

  /**
   * Displays error state.
   */
  private showError(message: string) {
    this.hideLoading();
    if (this.viewportContainer) {
      this.viewportContainer.innerHTML = `
        <div class="pdf-preview-error" style="margin: 40px auto; max-width: 80%;">
          <span class="error-badge">⚠️</span>
          <p>${escapeHtml(message)}</p>
        </div>
      `;
    }
  }

  /**
   * Renders the specified PDF page onto the canvas.
   */
  private async renderPage(num: number) {
    if (!this.pdfDoc || !this.canvas || !this.ctx) return;
    this.pageRendering = true;

    try {
      const page = await this.pdfDoc.getPage(num);

      // Calculate viewport at current scale
      const viewport = page.getViewport({ scale: this.scale });

      // Set canvas dimensions supporting High-DPI screens
      const outputScale = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(viewport.width * outputScale);
      this.canvas.height = Math.floor(viewport.height * outputScale);
      this.canvas.style.width = Math.floor(viewport.width) + "px";
      this.canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: this.ctx,
        transform: transform ?? undefined,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      await renderTask.promise;

      this.pageRendering = false;

      // Update indicators
      this.updateIndicators();

      // Handle queued rendering
      if (this.pageNumPending !== null) {
        const pending = this.pageNumPending;
        this.pageNumPending = null;
        this.renderPage(pending);
      }
    } catch (error: any) {
      console.error("Error rendering page:", error);
      this.pageRendering = false;
      this.showError(`Erreur d'affichage de la page ${num}: ${error.message}`);
    }
  }

  /**
   * Queues rendering of a page. Prevents race conditions during fast clicking.
   */
  private queueRenderPage(num: number) {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  }

  /**
   * Updates page number and zoom text displays, toggles button disabled states.
   */
  private updateIndicators() {
    if (!this.pdfDoc) return;

    const totalPages = this.pdfDoc.numPages;

    // Page indicators
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `Page ${this.pageNum} / ${totalPages}`;
    }

    if (this.prevButton) {
      this.prevButton.disabled = this.pageNum <= 1;
    }
    if (this.nextButton) {
      this.nextButton.disabled = this.pageNum >= totalPages;
    }

    // Zoom indicator
    if (this.zoomIndicator) {
      this.zoomIndicator.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }

  /**
   * Goes to the previous page.
   */
  private onPrevPage() {
    if (this.pageNum <= 1) return;
    this.pageNum--;
    this.queueRenderPage(this.pageNum);
  }

  /**
   * Goes to the next page.
   */
  private onNextPage() {
    if (!this.pdfDoc || this.pageNum >= this.pdfDoc.numPages) return;
    this.pageNum++;
    this.queueRenderPage(this.pageNum);
  }

  /**
   * Zooms in.
   */
  private onZoomIn() {
    if (this.scale >= 3.0) return;
    this.scale = Math.min(3.0, this.scale + 0.25);
    this.queueRenderPage(this.pageNum);
  }

  /**
   * Zooms out.
   */
  private onZoomOut() {
    if (this.scale <= 0.5) return;
    this.scale = Math.max(0.5, this.scale - 0.25);
    this.queueRenderPage(this.pageNum);
  }

  /**
   * Automatically calculates scale to fit the viewport width.
   */
  private async fitToWidth() {
    if (!this.pdfDoc || !this.viewportContainer) return;

    try {
      const page = await this.pdfDoc.getPage(this.pageNum);
      const viewport1x = page.getViewport({ scale: 1.0 });

      // Calculate available width inside viewport container
      const containerWidth = this.viewportContainer.clientWidth;
      const padding = 40; // 20px padding left + right
      const targetWidth = Math.max(200, containerWidth - padding);

      // Compute fit scale
      const fitScale = targetWidth / viewport1x.width;

      // Clamp between 0.5 and 2.0 to avoid extremely large canvases
      this.scale = Math.max(0.5, Math.min(2.0, fitScale));

      this.queueRenderPage(this.pageNum);
    } catch (e: any) {
      console.error("Error fitting page to width:", e);
    }
  }

  /**
   * Triggers a local browser download for the PDF file buffer.
   */
  private downloadPdf() {
    try {
      const blob = new Blob([this.arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error downloading PDF:", error);
    }
  }

  /**
   * Toggles pseudo-fullscreen mode for the viewer.
   */
  private toggleFullscreen() {
    if (!this.viewerEl) return;

    this.isFullscreen = !this.isFullscreen;

    if (this.isFullscreen) {
      // Move to document body to escape transform containing blocks (like the drawer)
      document.body.appendChild(this.viewerEl);
      this.viewerEl.classList.add("pdf-fullscreen-mode");
      window.addEventListener("keydown", this.handleKeyDown);
    } else {
      // Move back to the original container
      this.container.appendChild(this.viewerEl);
      this.viewerEl.classList.remove("pdf-fullscreen-mode");
      window.removeEventListener("keydown", this.handleKeyDown);
    }

    const btn = this.viewerEl.querySelector("#pdf-toggle-fullscreen");
    if (btn) {
      if (this.isFullscreen) {
        btn.setAttribute("title", "Quitter le plein écran");
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
      } else {
        btn.setAttribute("title", "Pseudo plein écran");
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
      }
    }

    // Automatically recalculate fit scale for the new dimensions after layout renders
    setTimeout(() => {
      this.fitToWidth();
    }, 100);
  }

  /**
   * Exits fullscreen mode and cleans up references.
   */
  private exitFullscreenAndCleanup() {
    this.isFullscreen = false;
    window.removeEventListener("keydown", this.handleKeyDown);

    if (this.viewerEl) {
      this.viewerEl.classList.remove("pdf-fullscreen-mode");
      if (document.body.contains(this.container)) {
        this.container.appendChild(this.viewerEl);
      } else {
        this.viewerEl.remove();
      }
    }
  }

  /**
   * Handles keyboard events, specifically closing fullscreen on Escape.
   * Auto-cleans itself if the viewer container is removed from the DOM, or if the drawer is closed.
   */
  private handleKeyDown = (e: KeyboardEvent) => {
    const drawer = document.getElementById("activity-drawer");
    const isDrawerActive = drawer ? drawer.classList.contains("active") : false;

    if (!document.body.contains(this.container) || !isDrawerActive) {
      this.exitFullscreenAndCleanup();
      return;
    }
    if (e.key === "Escape" && this.isFullscreen) {
      this.toggleFullscreen();
      return;
    }

    // Support Arrow keys in fullscreen mode even if focus shifted (e.g. keydown on window)
    if (this.isFullscreen && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
        return; // Let user edit standard text inputs/textareas
      }
      e.preventDefault();
      if (e.key === "ArrowLeft") {
        this.onPrevPage();
      } else {
        this.onNextPage();
      }
    }
  };
}
