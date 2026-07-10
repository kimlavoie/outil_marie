import { read, utils } from "xlsx";
import { escapeHtml } from "../utils/utils.ts";

export class XlsxViewer {
  private container: HTMLElement;
  private arrayBuffer: ArrayBuffer;
  private fileName: string;
  private workbook: any = null;
  private activeSheet: string = "";
  private isFullscreen: boolean = false;

  // DOM elements
  private viewerEl: HTMLElement | null = null;
  private tabsEl: HTMLElement | null = null;
  private viewportContainer: HTMLElement | null = null;
  private tableContainer: HTMLElement | null = null;

  constructor(container: HTMLElement, arrayBuffer: ArrayBuffer, fileName: string) {
    this.container = container;
    this.arrayBuffer = arrayBuffer;
    this.fileName = fileName;
  }

  /**
   * Initializes the Excel viewer, builds layout, binds event handlers, and loads the workbook.
   */
  public async init() {
    this.renderLayout();
    this.bindEvents();

    try {
      this.workbook = read(this.arrayBuffer, { type: "array" });
      if (!this.workbook.SheetNames || !this.workbook.SheetNames.length) {
        throw new Error("Le classeur ne contient aucune feuille.");
      }
      this.activeSheet = this.workbook.SheetNames[0];
      this.renderTabs();
      this.renderSheet();
    } catch (error: any) {
      console.error("Excel loading error:", error);
      this.showError(`Impossible de charger le fichier Excel : ${error.message}`);
    }
  }

  /**
   * Renders the HTML structure for the custom Excel viewer.
   */
  private renderLayout() {
    this.container.innerHTML = `
      <div class="xlsx-custom-viewer" tabindex="0">
        <div class="xlsx-toolbar">
          <div class="xlsx-toolbar-group xlsx-sheet-tabs" id="xlsx-sheet-tabs"></div>
          <div class="xlsx-toolbar-group">
            <button type="button" class="btn btn-secondary btn-sm" id="xlsx-toggle-fullscreen" title="Pseudo plein écran">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="xlsx-download" title="Télécharger le fichier Excel" style="display: flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
              <span>Télécharger</span>
            </button>
          </div>
        </div>
        <div class="xlsx-viewport" id="xlsx-viewport-container">
          <div class="xlsx-table-container" id="xlsx-table-container"></div>
        </div>
      </div>
    `;

    this.viewerEl = this.container.querySelector(".xlsx-custom-viewer");
    this.tabsEl = this.container.querySelector("#xlsx-sheet-tabs");
    this.viewportContainer = this.container.querySelector("#xlsx-viewport-container");
    this.tableContainer = this.container.querySelector("#xlsx-table-container");
  }

  /**
   * Binds user event listeners.
   */
  private bindEvents() {
    this.container.querySelector("#xlsx-download")?.addEventListener("click", () => this.downloadXlsx());
    this.container.querySelector("#xlsx-toggle-fullscreen")?.addEventListener("click", () => this.toggleFullscreen());
  }

  /**
   * Renders one tab per sheet in the workbook and wires up sheet switching.
   */
  private renderTabs() {
    if (!this.tabsEl || !this.workbook) return;

    if (this.workbook.SheetNames.length <= 1) {
      this.tabsEl.innerHTML = "";
      return;
    }

    this.tabsEl.innerHTML = this.workbook.SheetNames.map(
      (name: string) =>
        `<button type="button" class="xlsx-sheet-tab${name === this.activeSheet ? " active" : ""}" data-sheet="${escapeHtml(name)}">${escapeHtml(name)}</button>`
    ).join("");

    this.tabsEl.querySelectorAll<HTMLButtonElement>(".xlsx-sheet-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sheet = btn.dataset.sheet;
        if (!sheet || sheet === this.activeSheet) return;
        this.activeSheet = sheet;
        this.renderTabs();
        this.renderSheet();
      });
    });
  }

  /**
   * Renders the currently active sheet as an HTML table.
   */
  private renderSheet() {
    if (!this.tableContainer || !this.workbook) return;

    const sheet = this.workbook.Sheets[this.activeSheet];
    if (!sheet) {
      this.tableContainer.innerHTML = `<p style="padding: 20px; color: var(--text-muted);">Feuille vide.</p>`;
      return;
    }

    this.tableContainer.innerHTML = utils.sheet_to_html(sheet);
  }

  /**
   * Displays error state.
   */
  private showError(message: string) {
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
   * Triggers a local browser download for the Excel file buffer.
   */
  private downloadXlsx() {
    try {
      const blob = new Blob([this.arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error downloading Excel file:", error);
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
      this.viewerEl.classList.add("xlsx-fullscreen-mode");
      window.addEventListener("keydown", this.handleKeyDown);
    } else {
      // Move back to the original container
      this.container.appendChild(this.viewerEl);
      this.viewerEl.classList.remove("xlsx-fullscreen-mode");
      window.removeEventListener("keydown", this.handleKeyDown);
    }

    const btn = this.viewerEl.querySelector("#xlsx-toggle-fullscreen");
    if (btn) {
      if (this.isFullscreen) {
        btn.setAttribute("title", "Quitter le plein écran");
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
      } else {
        btn.setAttribute("title", "Pseudo plein écran");
        btn.innerHTML = `<svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
      }
    }
  }

  /**
   * Exits fullscreen mode and cleans up references.
   */
  private exitFullscreenAndCleanup() {
    this.isFullscreen = false;
    window.removeEventListener("keydown", this.handleKeyDown);

    if (this.viewerEl) {
      this.viewerEl.classList.remove("xlsx-fullscreen-mode");
      if (document.body.contains(this.container)) {
        this.container.appendChild(this.viewerEl);
      } else {
        this.viewerEl.remove();
      }
    }
  }

  /**
   * Closes fullscreen on Escape. Auto-cleans itself if the viewer container is removed from the
   * DOM, or if the drawer is closed.
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
    }
  };
}
