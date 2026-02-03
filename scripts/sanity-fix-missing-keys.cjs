#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@sanity/client");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

const rootDir = path.resolve(__dirname, "..");
[
  path.join(rootDir, "apps/studio/.env"),
  path.join(rootDir, "apps/studio/.env.local"),
  path.join(rootDir, "apps/web/.env.local"),
].forEach(loadEnvFile);

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  "production";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-02-10";
const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN;

if (!projectId) throw new Error("Missing SANITY project ID");
if (!token) throw new Error("Missing SANITY API token");

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const ensureKeys = (value) => {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      if (item && typeof item === "object") {
        if (!item._key) {
          changed = true;
          return { ...item, _key: crypto.randomUUID() };
        }
      }
      return item;
    });
    return { value: next, changed };
  }
  return { value, changed: false };
};

const fixBlockArray = (block, field) => {
  if (!block[field]) return false;
  const result = ensureKeys(block[field]);
  if (result.changed) block[field] = result.value;
  return result.changed;
};

const walk = (node) => {
  let changed = false;
  if (Array.isArray(node)) {
    const result = ensureKeys(node);
    if (result.changed) changed = true;
    return { node: result.value, changed };
  }
  if (!node || typeof node !== "object") return { node, changed };

  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      const result = ensureKeys(value);
      if (result.changed) {
        node[key] = result.value;
        changed = true;
      }
    } else if (value && typeof value === "object") {
      const result = walk(value);
      if (result.changed) {
        node[key] = result.node;
        changed = true;
      }
    }
  }
  return { node, changed };
};

const main = async () => {
  const drafts = await client.fetch(
    `*[_id match "drafts.*" && _type in ["page","homePage"]]{_id, _type, pageBuilder}`,
  );

  let mutated = 0;
  for (const doc of drafts) {
    if (!Array.isArray(doc.pageBuilder)) continue;
    const updatedPageBuilder = [];
    let changed = false;
    for (const block of doc.pageBuilder) {
      const { node, changed: blockChanged } = walk({ ...block });
      if (blockChanged) changed = true;
      updatedPageBuilder.push(node);
    }
    if (changed) {
      await client.patch(doc._id).set({ pageBuilder: updatedPageBuilder }).commit();
      mutated += 1;
    }
  }

  console.log(`Updated ${mutated} draft documents with missing _key values.`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
