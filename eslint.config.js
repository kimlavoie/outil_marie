// Flat ESLint config for a vanilla-JS, no-bundler app: every file in js/ is loaded as a plain
// <script> (see index.html) and shares one global scope by design, so `no-undef` is disabled —
// it would otherwise flag every cross-file function/variable reference as an error. Rules here
// focus on catching real mistakes (typos, unreachable code, unused locals) rather than
// enforcing a module boundary the app doesn't have.
module.exports = [
  {
    files: ["js/**/*.js"],
    ignores: ["js/lib/**", "**/*.min.js", "**/*.umd.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
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
      }
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
  }
];
