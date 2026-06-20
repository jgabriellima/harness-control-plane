#!/usr/bin/env node
/**
 * Align app/package.json semver with app/src-tauri/tauri.conf.json (pb.tauri.distribute sync-version).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(appRoot, "package.json");
const tauriPath = join(appRoot, "src-tauri", "tauri.conf.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = pkg.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid semver in ${pkgPath}: ${String(version)}`);
  process.exit(1);
}

const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
if (tauri.version === version) {
  console.log(`Version already synced: ${version}`);
  process.exit(0);
}

tauri.version = version;
writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);
console.log(`Synced tauri.conf.json version → ${version}`);
