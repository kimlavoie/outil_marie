// Ambient declarations for globals that come from outside our own ES modules: third-party
// vendored scripts loaded as plain non-module <script> tags (lib/xlsx.full.min.js,
// lib/chart.umd.js — see index.html), and browser APIs (File System Access) not yet in
// TypeScript's default DOM lib types. Every app-owned function/value is a real import now.

declare global {
  const Chart: any;
  const XLSX: any;

  interface Window {
    // File System Access API (Chrome/Edge only).
    showOpenFilePicker?: () => Promise<any[]>;
    showSaveFilePicker?: (options?: any) => Promise<any>;
  }
}

export {};
