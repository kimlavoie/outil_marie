import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

// The 4 files below are loaded as plain <script defer> (not type="module") in index.html because
// they rely on being in the same global scope as each other and as the window.X globals the
// module scripts export (see js/state.js bottom). Vite only bundles type="module" scripts — it
// intentionally leaves these untouched, so `vite build` never copies them into dist on its own.
// This plugin copies them (and the vendored lib/ scripts loaded the same way) verbatim so the
// production build serves byte-for-byte the same files as the dev server, preserving Phase 1's
// zero-behavior-change goal.
const NONMODULE_SCRIPTS = ["navigation.js", "activities-form.js", "account-report.js", "main.js"];

function copyLegacyStaticScripts() {
  return {
    name: "copy-legacy-static-scripts",
    apply: "build",
    closeBundle() {
      cpSync("lib", "dist/lib", { recursive: true });
      mkdirSync("dist/js", { recursive: true });
      for (const file of NONMODULE_SCRIPTS) {
        cpSync(path.join("js", file), path.join("dist/js", file));
      }
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
  plugins: [react(), copyLegacyStaticScripts()]
});
