import { readFileSync, writeFileSync } from "node:fs";

const settingsPath = new URL("../settings.json", import.meta.url);
const defaults = JSON.parse(readFileSync(new URL("../settings.defaults.json", import.meta.url), "utf8"));
let settings = {};
try {
  settings = JSON.parse(readFileSync(settingsPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
writeFileSync(settingsPath, `${JSON.stringify({ ...settings, ...defaults }, null, 2)}\n`, { mode: 0o600 });
console.log("Applied shared Pi settings.");
