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
  process.env.SANITY_API_READ_TOKEN ||
  process.env.SANITY_API_WRITE_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_API_TOKEN;

if (!projectId) {
  throw new Error(
    "Missing SANITY_STUDIO_PROJECT_ID/NEXT_PUBLIC_SANITY_PROJECT_ID.",
  );
}
if (!token) {
  throw new Error(
    "Missing SANITY_API_READ_TOKEN/SANITY_API_WRITE_TOKEN/SANITY_API_TOKEN.",
  );
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const contentDir = path.join(rootDir, "content-specs");
const outputPath = path.join(contentDir, "media-manifest.md");

const splitFirst = (value, separator = ":") => {
  const idx = value.indexOf(separator);
  if (idx === -1) return [value, null];
  return [value.slice(0, idx), value.slice(idx + 1)];
};

const stripQuotes = (value) => {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const parseValue = (raw) => {
  const value = raw.trim();
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (!Number.isNaN(Number(value)) && value !== "") return Number(value);
  return stripQuotes(value);
};

const parseFrontmatter = (text) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: text };
  const raw = match[1];
  const data = {};
  raw.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const [key, rest] = splitFirst(line);
    if (rest === null) return;
    data[key.trim()] = parseValue(rest.trim());
  });
  return { data, body: text.slice(match[0].length) };
};

const normalizePath = (parent, key) =>
  parent ? `${parent}.${key}` : String(key);

const collectAssetRefs = (value, currentPath, refs) => {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectAssetRefs(item, `${currentPath}[${index}]`, refs);
    });
    return;
  }

  if (typeof value !== "object") return;

  const assetRef = value?.asset?._ref;
  if (typeof assetRef === "string" && assetRef) {
    refs.push({
      path: currentPath,
      assetRef,
      itemType: value._type || "asset",
    });
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === "asset") return;
    collectAssetRefs(child, normalizePath(currentPath, key), refs);
  });
};

const main = async () => {
  const files = fs
    .readdirSync(contentDir)
    .filter(
      (file) =>
        file.endsWith(".md") &&
        ![
          "_template.md",
          "faqs.md",
          "navigation.md",
          "media-manifest.md",
        ].includes(file),
    )
    .sort((a, b) => a.localeCompare(b));

  const specPages = files
    .map((file) => {
      const raw = fs.readFileSync(path.join(contentDir, file), "utf8");
      const { data } = parseFrontmatter(raw);
      const slug = typeof data.slug === "string" ? data.slug.trim() : "";
      if (!slug) return null;
      return { file, slug };
    })
    .filter(Boolean);

  const slugs = specPages.map((page) => page.slug);
  const pageDocs = await client
    .withConfig({ perspective: "drafts" })
    .fetch(
      `*[_type == "page" && slug.current in $slugs]{
        _id,
        title,
        "slug": slug.current,
        image,
        seoImage,
        pageBuilder
      }`,
      { slugs },
    );
  const pageBySlug = new Map(pageDocs.map((doc) => [doc.slug, doc]));

  const pageRecords = [];
  const allAssetIds = new Set();
  for (const pageSpec of specPages) {
    const doc = pageBySlug.get(pageSpec.slug) || null;
    const refs = [];
    if (doc) {
      collectAssetRefs(
        {
          image: doc.image,
          seoImage: doc.seoImage,
          pageBuilder: doc.pageBuilder,
        },
        "page",
        refs,
      );
    }

    const dedupedRefs = Array.from(
      new Map(
        refs.map((ref) => [`${ref.path}::${ref.assetRef}`, ref]),
      ).values(),
    ).sort((a, b) => a.path.localeCompare(b.path));

    dedupedRefs.forEach((ref) => allAssetIds.add(ref.assetRef));
    pageRecords.push({
      ...pageSpec,
      doc,
      refs: dedupedRefs,
    });
  }

  const assetIds = Array.from(allAssetIds).sort((a, b) => a.localeCompare(b));
  const assetDocs = assetIds.length
    ? await client.fetch(
        `*[_id in $assetIds]{
          _id,
          _type,
          originalFilename,
          mimeType
        }`,
        { assetIds },
      )
    : [];
  const assetById = new Map(assetDocs.map((asset) => [asset._id, asset]));

  const usageByAsset = new Map();
  pageRecords.forEach((record) => {
    record.refs.forEach((ref) => {
      const list = usageByAsset.get(ref.assetRef) || [];
      list.push(`${record.slug} @ ${ref.path}`);
      usageByAsset.set(ref.assetRef, list);
    });
  });

  const lines = [];
  lines.push("# Media Manifest");
  lines.push("");
  lines.push("Do not edit manually. Regenerate with `node scripts/sanity-export-media-manifest.cjs`.");
  lines.push("");
  lines.push("Generated from Sanity draft-perspective page documents.");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Content spec pages: ${pageRecords.length}`);
  lines.push(`- Matching Sanity pages: ${pageRecords.filter((record) => record.doc).length}`);
  lines.push(`- Unique referenced assets: ${assetIds.length}`);
  const missingPages = pageRecords.filter((record) => !record.doc);
  if (missingPages.length > 0) {
    lines.push(`- Missing Sanity pages for specs: ${missingPages.length}`);
  }
  lines.push("");

  if (missingPages.length > 0) {
    lines.push("## Missing Pages");
    missingPages.forEach((record) => {
      lines.push(`- \`${record.slug}\` (\`content-specs/${record.file}\`)`);
    });
    lines.push("");
  }

  lines.push("## Page Usage");
  lines.push("");
  pageRecords.forEach((record) => {
    lines.push(`### ${record.slug}`);
    lines.push(`- Spec file: \`content-specs/${record.file}\``);
    lines.push(`- Doc ID: \`${record.doc?._id || "missing"}\``);
    if (!record.doc) {
      lines.push("- Media refs: page missing in Sanity");
      lines.push("");
      return;
    }
    if (record.refs.length === 0) {
      lines.push("- Media refs: none");
      lines.push("");
      return;
    }
    record.refs.forEach((ref) => {
      const asset = assetById.get(ref.assetRef);
      const filename = asset?.originalFilename || "unknown-filename";
      lines.push(
        `- \`${ref.path}\` -> \`${ref.assetRef}\` (${filename})`,
      );
    });
    lines.push("");
  });

  lines.push("## Asset Index");
  lines.push("");
  assetIds.forEach((assetId) => {
    const asset = assetById.get(assetId);
    const filename = asset?.originalFilename || "unknown-filename";
    const type = asset?._type || "unknown-type";
    const uses = (usageByAsset.get(assetId) || []).sort((a, b) =>
      a.localeCompare(b),
    );
    lines.push(`- \`${assetId}\` (${filename}, ${type})`);
    lines.push(`  uses: ${uses.join("; ")}`);
  });

  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
  console.log(`Wrote ${path.relative(rootDir, outputPath)}.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
