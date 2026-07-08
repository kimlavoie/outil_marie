// Flat ESLint config for the app: js/*.js are still plain <script> globals by design (see
// file banner below) so `no-undef` stays off there — it would otherwise flag every cross-file
// function/variable reference as an error. js/*.ts(x) are real ES modules (Vite/TS, Phase 2-4 of
// the migration, see TODO.txt); type-checking is tsc's job, so typescript-eslint here is
// non-type-aware (fast, syntax-only) and focused on the same "catch real mistakes" rules as the
// JS block, not on enforcing style tsc already enforces.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Globals shared by both blocks: things the JS files reference as bare identifiers because
// they're either browser/runtime built-ins or ambient `declare global` bridges from
// js/globals.d.ts (Chart, XLSX) that plain ESLint (without type info) can't otherwise see.
const sharedGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  localStorage: "readonly",
  indexedDB: "readonly",
  fetch: "readonly",
  alert: "readonly",
  confirm: "readonly",
  prompt: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  FileReader: "readonly",
  Blob: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Intl: "readonly",
  Chart: "readonly",
  XLSX: "readonly",
  module: "readonly"
};

export default tseslint.config(
  {
    files: ["js/**/*.js"],
    ignores: ["js/lib/**", "**/*.min.js", "**/*.umd.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: sharedGlobals
    },
    rules: {
      "no-undef": "off",
      // vars: "local" only flags unused variables declared *inside* a function/block — top-level
      // `function foo() {}` declarations are the app's cross-file API (see file banner comment)
      // and are expected to look "unused" from any single file's perspective.
      "no-unused-vars": ["warn", { args: "none", vars: "local", varsIgnorePattern: "^_" }],
      eqeqeq: ["warn", "smart"],
      "no-var": "warn",
      "no-fallthrough": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-const-assign": "error"
    }
  },
  {
    files: ["js/**/*.ts", "js/**/*.tsx"],
    extends: [tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: sharedGlobals
    },
    rules: {
      // Only the two classic hook-correctness rules, not the plugin's full "recommended" set:
      // the newer React Compiler-era rules (set-state-in-effect, immutability, ...) assume state
      // is React-owned, but these views intentionally read/mutate the shared external appState
      // object (see TODO.txt) — those rules misfire on that deliberate pattern.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Real imports/exports here, but still some bare window.X()/globals.d.ts-declared bridge
      // calls to not-yet-converted non-module scripts (navigation.js, main.js) — same reasoning
      // as the JS block above for keeping no-undef off.
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      // The migration leans on `any` deliberately at interop boundaries (appState, DOM helpers,
      // XLSX/Chart globals) rather than modeling every shape up front — see TODO.txt Phase 2.
      "@typescript-eslint/no-explicit-any": "off",
      eqeqeq: ["warn", "smart"],
      "no-var": "warn",
      "no-fallthrough": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-const-assign": "error"
    }
  }
);
