#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
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

const parseNavigationSlugs = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const slugs = new Set();
  let inColumns = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "## Columns (left to right)") {
      inColumns = true;
      continue;
    }
    if (trimmed.startsWith("## ") && trimmed !== "## Columns (left to right)") {
      inColumns = false;
    }
    if (!inColumns) continue;
    if (trimmed.startsWith("- ")) {
      const entry = trimmed.slice(2).trim();
      const parts = entry.split("—").map((part) => part.trim());
      const url = parts[1];
      if (!url) continue;
      if (url.startsWith("/")) slugs.add(url);
    }
  }
  return Array.from(slugs);
};

const parseContentSpecSlugs = (dir) => {
  const slugs = new Set();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) continue;
    const fm = match[1];
    const line = fm.split(/\r?\n/).find((l) => l.trim().startsWith("slug:"));
    if (!line) continue;
    const slug = line.split(":").slice(1).join(":").trim();
    if (slug.startsWith("/")) slugs.add(slug);
  }
  return Array.from(slugs);
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(rootDir, "content-backups", timestamp);
  ensureDir(backupDir);

  const docs = await client.fetch(
    `*[_type in ["page","homePage","blogIndex"]]{_id,_type,title,slug,seoNoIndex,seoHideFromLists}`,
  );

  fs.writeFileSync(
    path.join(backupDir, "pages.json"),
    JSON.stringify(docs, null, 2),
  );

  const navigationSlugs = parseNavigationSlugs(
    path.join(rootDir, "content-specs", "navigation.md"),
  );
  const specSlugs = parseContentSpecSlugs(path.join(rootDir, "content-specs"));

  const allowList = new Set([
    "/",
    "/free-consultation",
    "/blog",
    "/drop-in",
    "/faq",
    "/results",
    ...navigationSlugs,
    ...specSlugs,
  ]);

  const pages = docs.filter((doc) => doc._type === "page");
  const slugGroups = new Map();
  pages.forEach((doc) => {
    const slug = doc.slug?.current;
    if (!slug) return;
    if (!slugGroups.has(slug)) slugGroups.set(slug, []);
    slugGroups.get(slug).push(doc);
  });

  const archiveIds = new Set();

  for (const [slug, items] of slugGroups.entries()) {
    if (items.length > 1) {
      // keep the first item (arbitrary) and archive the rest
      items.slice(1).forEach((doc) => archiveIds.add(doc._id));
    }
  }

  for (const doc of pages) {
    const slug = doc.slug?.current;
    if (!slug) continue;
    if (!allowList.has(slug)) {
      archiveIds.add(doc._id);
    }
  }

  const archiveList = Array.from(archiveIds);
  if (!apply) {
    console.log(`Backup written to ${backupDir}/pages.json`);
    console.log(`Would archive ${archiveList.length} page(s). Use --apply to proceed.`);
    if (archiveList.length) {
      console.log(archiveList.join("\n"));
    }
    return;
  }

  for (const id of archiveList) {
    const doc = pages.find((d) => d._id === id);
    const title = doc?.title ?? "";
    const nextTitle = title.startsWith("[ARCHIVED]") ? title : `[ARCHIVED] ${title}`;
    await client
      .patch(id)
      .set({
        seoNoIndex: true,
        seoHideFromLists: true,
        title: nextTitle,
      })
      .commit();
  }

  console.log(`Backup written to ${backupDir}/pages.json`);
  console.log(`Archived ${archiveList.length} page(s).`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
