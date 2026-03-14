// CJS shim for node:sqlite — used by vitest config to work around Vite 5 not recognising
// the experimental node:sqlite module as a Node built-in.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite = require("node:sqlite");
module.exports = sqlite;
