import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react()],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "INEFFECTIVE_DYNAMIC_IMPORT") return;
        warn(warning);
      }
    }
  }
});
