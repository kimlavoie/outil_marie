// Ambient declarations for globals that come from outside our own ES modules: browser APIs (File
// System Access) not yet in TypeScript's default DOM lib types. Chart.js and xlsx used to be
// vendored scripts loaded as plain non-module <script> tags — both are real npm imports now (see
// dashboard-view.tsx's "chart.js/auto" import and excel-export.ts's dynamic import("xlsx")), so
// every app-owned function/value is a real import.

declare global {
  interface Window {
    // File System Access API (Chrome/Edge only).
    showOpenFilePicker?: () => Promise<any[]>;
    showSaveFilePicker?: (options?: any) => Promise<any>;
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<any>;
  }
}

export {};
