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

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const SOURCE_SLUG = "/memberships";

const normalizeTitle = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const stripSystemFields = (doc) => {
  const out = {};
  Object.entries(doc || {}).forEach(([key, value]) => {
    if (key.startsWith("_")) return;
    out[key] = value;
  });
  return out;
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const getSlug = (doc) =>
  typeof doc?.slug?.current === "string" ? doc.slug.current : null;

const getDraftId = (docId) =>
  String(docId).startsWith("drafts.") ? String(docId) : `drafts.${docId}`;

const sameTransform = (a, b) =>
  JSON.stringify(a || null) === JSON.stringify(b || null);

const matchSourceKey = (cardTitle, sourceMap) => {
  const normalized = normalizeTitle(cardTitle);
  if (sourceMap.has(normalized)) return normalized;
  if (normalized.startsWith("hybrid")) return "hybrid";
  if (normalized.startsWith("group class")) return "group class";
  if (normalized.startsWith("private coaching")) return "private coaching";
  if (normalized.startsWith("new foundations")) return "new foundations";
  if (normalized.startsWith("jump start")) return "jump start";
  return null;
};

const findMembershipSourceBlock = (pageBuilder) => {
  const blocks = Array.isArray(pageBuilder) ? pageBuilder : [];
  return (
    blocks.find(
      (block) =>
        block?._type === "imageLinkCards" &&
        normalizeTitle(block.title) === "membership options",
    ) || null
  );
};

const main = async () => {
  const draftsClient = client.withConfig({ perspective: "drafts" });
  const docs = await draftsClient.fetch(
    `*[_type == "page" && defined(pageBuilder)]{...}`,
  );

  const sourceDoc = docs.find((doc) => getSlug(doc) === SOURCE_SLUG);
  if (!sourceDoc) {
    throw new Error(`Could not find source page for slug ${SOURCE_SLUG}`);
  }

  const sourceBlock = findMembershipSourceBlock(sourceDoc.pageBuilder);
  if (!sourceBlock) {
    throw new Error(`Could not find membership cards block on ${SOURCE_SLUG}`);
  }

  const sourceMap = new Map();
  (Array.isArray(sourceBlock.cards) ? sourceBlock.cards : []).forEach((card) => {
    const key = normalizeTitle(card?.title);
    if (!key || !card?.image?.asset?._ref) return;
    sourceMap.set(key, clone(card.image));
  });

  const updates = [];
  for (const doc of docs) {
    const slug = getSlug(doc);
    if (!slug || slug === SOURCE_SLUG) continue;
    const blocks = Array.isArray(doc.pageBuilder) ? clone(doc.pageBuilder) : [];
    let changed = false;
    const matches = [];

    blocks.forEach((block, blockIndex) => {
      if (block?._type !== "imageLinkCards" || !Array.isArray(block.cards)) return;
      block.cards.forEach((card, cardIndex) => {
        const sourceKey = matchSourceKey(card?.title, sourceMap);
        if (!sourceKey) return;
        const sourceImage = sourceMap.get(sourceKey);
        if (!sourceImage) return;
        if (sameTransform(card.image, sourceImage)) return;

        const nextImage = clone(sourceImage);
        if (card?.image?._type && !nextImage._type) {
          nextImage._type = card.image._type;
        }
        block.cards[cardIndex].image = nextImage;
        changed = true;
        matches.push({
          blockIndex,
          blockTitle: block.title || null,
          cardIndex,
          cardTitle: card.title || null,
          sourceTitle: sourceKey,
          previousAssetRef: card?.image?.asset?._ref || null,
          nextAssetRef: nextImage?.asset?._ref || null,
          hadCrop: Boolean(card?.image?.crop),
          hadHotspot: Boolean(card?.image?.hotspot),
        });
      });
    });

    if (!changed) continue;
    updates.push({
      doc,
      slug,
      nextPageBuilder: blocks,
      matches,
    });
  }

  if (!updates.length) {
    console.log("No membership card image changes needed.");
    return;
  }

  if (!APPLY) {
    console.log(`Would update ${updates.length} page draft(s).`);
    updates.forEach((update) => {
      console.log(`- ${update.slug}`);
      update.matches.forEach((match) => {
        console.log(
          `  - ${match.cardTitle} -> ${match.nextAssetRef} (from ${match.sourceTitle})`,
        );
      });
    });
    return;
  }

  for (const update of updates) {
    const baseDoc = stripSystemFields(update.doc);
    const draftId = getDraftId(update.doc._id);
    await client.createOrReplace({
      ...baseDoc,
      _id: draftId,
      _type: "page",
      pageBuilder: update.nextPageBuilder,
    });
  }

  console.log(`Updated ${updates.length} page draft(s).`);
  updates.forEach((update) => {
    console.log(`- ${update.slug}: ${update.matches.length} card(s)`);
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
