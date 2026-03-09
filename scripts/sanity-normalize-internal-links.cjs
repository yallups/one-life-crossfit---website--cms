#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

let createClient = null;
try {
  ({ createClient } = require("@sanity/client"));
} catch {
  ({ createClient } = require(path.join(
    __dirname,
    "../apps/studio/node_modules/@sanity/client",
  )));
}

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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
const token =
  process.env.SANITY_API_WRITE_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_API_READ_TOKEN;

if (!projectId) throw new Error("Missing SANITY project ID");
if (!token) throw new Error("Missing SANITY API token");

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const APPLY = new Set(process.argv.slice(2)).has("--apply");
const INTERNAL_HOSTS = new Set(["onelifecrossfit.com", "www.onelifecrossfit.com"]);
const LINKABLE_TYPES = ["page", "blog", "blogIndex"];
const TARGET_DOC_TYPES = ["page", "blog", "blogIndex", "navbar", "footer"];

const normalizeInternalSlug = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "/") return raw;
  const normalized = raw.replace(/\/+$/, "");
  return normalized || "/";
};

const getInternalSlugCandidate = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("?")) return null;
  if (raw.startsWith("/")) {
    if (raw.includes("?") || raw.includes("#")) return null;
    return normalizeInternalSlug(raw);
  }
  try {
    const url = new URL(raw);
    if (!INTERNAL_HOSTS.has(url.hostname)) return null;
    if (url.search || url.hash) return null;
    return normalizeInternalSlug(url.pathname || "/");
  } catch {
    return null;
  }
};

const getDraftId = (docId) =>
  String(docId).startsWith("drafts.") ? String(docId) : `drafts.${docId}`;

const stripTopLevelSystemFields = (doc) => {
  const next = { ...doc };
  delete next._rev;
  delete next._updatedAt;
  delete next._createdAt;
  delete next._originalId;
  return next;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const normalizeCustomUrl = (node, slugMap) => {
  if (!node || node._type !== "customUrl" || node.type !== "external") {
    return null;
  }
  const raw = String(node.external || node.href || "").trim();
  const slug = getInternalSlugCandidate(raw);
  if (!slug) return null;
  const ref = slugMap.get(slug);
  if (!ref) return null;
  return {
    _type: "customUrl",
    type: "internal",
    internal: { _type: "reference", _ref: ref },
    openInNewTab: Boolean(node.openInNewTab),
  };
};

const transformNode = (node, slugMap, pathParts, changes) => {
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      transformNode(item, slugMap, [...pathParts, `[${index}]`], changes),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const normalizedCustomUrl = normalizeCustomUrl(node, slugMap);
  if (normalizedCustomUrl) {
    changes.push({
      path: pathParts.join("."),
      from: node.external || node.href || "",
      to: normalizedCustomUrl.internal._ref,
    });
    return normalizedCustomUrl;
  }

  const next = Array.isArray(node) ? [] : {};
  Object.entries(node).forEach(([key, value]) => {
    const nextPath = key.startsWith("[") ? [...pathParts, key] : [...pathParts, key];
    next[key] = transformNode(value, slugMap, nextPath, changes);
  });
  return next;
};

const main = async () => {
  const draftsClient = client.withConfig({ perspective: "drafts" });

  const slugDocs = await client.fetch(
    `*[_type in $types && defined(slug.current)]{_id, "slug": slug.current}`,
    { types: LINKABLE_TYPES },
  );
  const draftSlugDocs = await draftsClient.fetch(
    `*[_id match "drafts.*" && _type in $types && defined(slug.current)]{_id, "slug": slug.current}`,
    { types: LINKABLE_TYPES },
  );
  const slugMap = new Map();
  [...slugDocs, ...draftSlugDocs].forEach((doc) => {
    const slug = normalizeInternalSlug(doc.slug);
    if (slug) {
      slugMap.set(slug, doc._id);
    }
  });

  const docs = await draftsClient.fetch(
    `*[_type in $types]{...}`,
    { types: TARGET_DOC_TYPES },
  );

  const updates = [];
  docs.forEach((doc) => {
    const changes = [];
    const transformed = transformNode(deepClone(doc), slugMap, [], changes);
    if (!changes.length) return;
    updates.push({
      doc,
      nextDoc: transformed,
      changes,
    });
  });

  if (!updates.length) {
    console.log("No Sanity draft links needed normalization.");
    return;
  }

  if (!APPLY) {
    console.log(`Would normalize links in ${updates.length} draft document(s).`);
    updates.forEach((update) => {
      console.log(`- ${update.doc._type} ${update.doc._id} (${update.changes.length})`);
      update.changes.forEach((change) => {
        console.log(`  - ${change.path}: ${change.from} -> ${change.to}`);
      });
    });
    return;
  }

  for (const update of updates) {
    await client.createOrReplace({
      ...stripTopLevelSystemFields(update.nextDoc),
      _id: getDraftId(update.doc._id),
    });
  }

  console.log(`Normalized links in ${updates.length} draft document(s).`);
  updates.forEach((update) => {
    console.log(`- ${update.doc._type} ${getDraftId(update.doc._id)} (${update.changes.length})`);
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
