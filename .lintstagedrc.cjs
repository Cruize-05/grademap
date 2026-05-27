// Use node to call prettier directly — avoids PATH issues on Windows
// where node_modules/.bin/prettier is a bash script, not a .cmd
const { execSync } = require("child_process");
const path = require("path");

const prettierBin = path.join(__dirname, "node_modules", "prettier", "bin", "prettier.cjs");

module.exports = {
  "**/*.{ts,tsx,json,md,yaml,yml}": (files) =>
    `node "${prettierBin}" --write ${files.map((f) => `"${f}"`).join(" ")}`,
  "apps/mining/**/*.py": ["ruff check --fix", "ruff format"],
};
