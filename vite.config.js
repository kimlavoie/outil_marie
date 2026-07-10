import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
