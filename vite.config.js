import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync } from "node:fs";

// lib/xlsx.full.min.js and lib/chart.umd.js are third-party UMD bundles loaded as plain
// non-module <script> tags in index.html (they predate/aren't ES modules themselves) — Vite only
// bundles type="module" scripts, so it never copies these into dist on its own. Every app-owned
// script (navigation.js, account-report.js, main.js, and all the rest) is type="module" since
// Phase 5 of the Vite/React/TS migration (see TODO.txt) and gets bundled normally.
function copyVendoredLibs() {
  return {
    name: "copy-vendored-libs",
    apply: "build",
    closeBundle() {
      cpSync("lib", "dist/lib", { recursive: true });
    }
  };
}

// Phase 1 of the Vite/React/TS migration (see TODO.txt): Vite is introduced purely as a build
// tool here. No app code, imports, or globals are touched — index.html and every js/*.js file
// keep working exactly as they did with the plain static server.
//
// `base` matches where GitHub Pages actually serves the site: the default
// https://<user>.github.io/outil_marie/ URL, which puts the app under the /outil_marie/
// subpath rather than the domain root. If a custom domain is set up later (CNAME), this must
// go back to "/".
export default defineConfig({
  base: "/outil_marie/",
  plugins: [react(), copyVendoredLibs()]
});
