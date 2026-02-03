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
const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN;

if (!projectId) {
  throw new Error(
    "Missing SANITY_STUDIO_PROJECT_ID/NEXT_PUBLIC_SANITY_PROJECT_ID. Ensure your .env files are present.",
  );
}
if (!token) {
  throw new Error("Missing SANITY_API_TOKEN/SANITY_WRITE_TOKEN.");
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const contentDir = path.join(rootDir, "content-specs");

const stripQuotes = (value) => {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const parseInlineObject = (value) => {
  const inner = value.slice(1, -1).trim();
  if (!inner) return {};
  const obj = {};
  inner.split(",").forEach((part) => {
    const [rawKey, ...rest] = part.split(":");
    if (!rawKey || rest.length === 0) return;
    const key = rawKey.trim();
    const rawValue = rest.join(":").trim();
    obj[key] = parseValue(rawValue);
  });
  return obj;
};

const parseValue = (raw) => {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("{") && value.endsWith("}")) {
    return parseInlineObject(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value);
    } catch {
      return value
        .slice(1, -1)
        .split(",")
        .map((v) => stripQuotes(v.trim()))
        .filter(Boolean);
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (!Number.isNaN(Number(value)) && value !== "") return Number(value);
  return stripQuotes(value);
};

const splitFirst = (value, separator = ":") => {
  const idx = value.indexOf(separator);
  if (idx === -1) return [value, null];
  return [value.slice(0, idx), value.slice(idx + 1)];
};

const parseFrontmatter = (text) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: text };
  const raw = match[1];
  const data = {};
  raw.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const [key, rest] = splitFirst(line);
    if (!rest) return;
    data[key.trim()] = parseValue(rest.trim());
  });
  return { data, body: text.slice(match[0].length) };
};

const parseBlocksSection = (body) => {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    line.trim().toLowerCase() === "## blocks (config-ready)",
  );
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  const sectionLines = lines.slice(start + 1, end);
  const blocks = [];
  let currentBlock = null;
  let currentCollectionKey = null;
  let currentCollection = [];
  let currentArrayItem = null;
  let multilineKey = null;
  let multilineIndent = 0;
  let multilineLines = [];

  const finalizeCollection = () => {
    if (currentBlock && currentCollectionKey) {
      currentBlock[currentCollectionKey] = currentCollection;
      currentCollectionKey = null;
      currentCollection = [];
      currentArrayItem = null;
    }
  };

  const finalizeBlock = () => {
    finalizeCollection();
    if (currentBlock) {
      blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  const finalizeMultiline = () => {
    if (currentBlock && multilineKey) {
      currentBlock[multilineKey] = multilineLines.join("\n").trimEnd();
      multilineKey = null;
      multilineLines = [];
    }
  };

  for (let index = 0; index < sectionLines.length; index += 1) {
    let line = sectionLines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    if (multilineKey) {
      if (indent > multilineIndent || trimmed === "") {
        const contentIndent = multilineIndent + 2;
        const content =
          line.length >= contentIndent ? line.slice(contentIndent) : "";
        multilineLines.push(content);
        continue;
      }
      finalizeMultiline();
      index -= 1;
      continue;
    }
    if (indent === 0 && trimmed.startsWith("- ")) {
      finalizeBlock();
      const label = trimmed.slice(2).trim();
      const type = label.split(" (")[0].trim();
      currentBlock = { _type: type };
      continue;
    }
    if (!currentBlock) continue;
    if (indent >= 2 && trimmed.startsWith("- ") && !currentCollectionKey) {
      finalizeCollection();
      const fieldLine = trimmed.slice(2).trim();
      const [rawKey, rawValue] = splitFirst(fieldLine);
      const key = rawKey.trim();
      if (rawValue === null || rawValue.trim() === "") {
        currentCollectionKey = key;
        currentCollection = [];
        currentArrayItem = null;
      } else if (rawValue.trim() === "|-" || rawValue.trim() === "|") {
        multilineKey = key;
        multilineIndent = indent;
        multilineLines = [];
      } else {
        currentBlock[key] = parseValue(rawValue.trim());
      }
      continue;
    }
    if (currentCollectionKey && indent >= 4 && trimmed.startsWith("- ")) {
      if (!currentCollectionKey) continue;
      const itemLine = trimmed.slice(2).trim();
      const [rawKey, rawValue] = splitFirst(itemLine);
      if (rawValue === null) {
        currentCollection.push(parseValue(itemLine));
        currentArrayItem = null;
      } else {
        const obj = {};
        obj[rawKey.trim()] = parseValue(rawValue.trim());
        currentCollection.push(obj);
        currentArrayItem = obj;
      }
      continue;
    }
    if (indent >= 6 && currentArrayItem) {
      const [rawKey, rawValue] = splitFirst(trimmed);
      if (rawValue === null) continue;
      currentArrayItem[rawKey.trim()] = parseValue(rawValue.trim());
    }
  }

  finalizeMultiline();
  finalizeBlock();
  return blocks;
};

const parseTitle = (body) => {
  const match = body.match(/^#\s+(.+)\n/m);
  return match ? match[1].trim() : null;
};

const buildInlineCustomUrl = (value, slugMap) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("#")) {
    return {
      _type: "customUrl",
      type: "external",
      external: raw,
      openInNewTab: false,
    };
  }
  if (raw.startsWith("https://onelifecrossfit.com")) {
    const path = raw.replace("https://onelifecrossfit.com", "") || "/";
    const ref = slugMap.get(path);
    if (ref) {
      return {
        _type: "customUrl",
        type: "internal",
        internal: { _type: "reference", _ref: ref },
        openInNewTab: false,
      };
    }
  }
  if (raw.startsWith("/")) {
    const ref = slugMap.get(raw);
    if (ref) {
      return {
        _type: "customUrl",
        type: "internal",
        internal: { _type: "reference", _ref: ref },
        openInNewTab: false,
      };
    }
    return {
      _type: "customUrl",
      type: "external",
      external: raw,
      openInNewTab: false,
    };
  }
  return {
    _type: "customUrl",
    type: "external",
    external: raw,
    openInNewTab: raw.startsWith("http"),
  };
};

const parseInlineMarkdownLinks = (text, slugMap) => {
  const markDefs = [];
  const children = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    const [full, label, url] = match;
    const start = match.index;
    if (start > lastIndex) {
      children.push({
        _type: "span",
        _key: crypto.randomUUID(),
        text: text.slice(lastIndex, start),
        marks: [],
      });
    }
    const link = buildInlineCustomUrl(url, slugMap);
    if (link) {
      const markKey = crypto.randomUUID();
      markDefs.push({ _type: "customLink", _key: markKey, customLink: link });
      children.push({
        _type: "span",
        _key: crypto.randomUUID(),
        text: label,
        marks: [markKey],
      });
    } else {
      children.push({
        _type: "span",
        _key: crypto.randomUUID(),
        text: label,
        marks: [],
      });
    }
    lastIndex = start + full.length;
  }
  if (lastIndex < text.length) {
    children.push({
      _type: "span",
      _key: crypto.randomUUID(),
      text: text.slice(lastIndex),
      marks: [],
    });
  }
  return { children, markDefs };
};

const toPortableText = (value, slugMap) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const text = String(value);
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const blocks = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("### ")) {
      const content = trimmed.replace(/^###\s+/, "");
      const { children, markDefs } = parseInlineMarkdownLinks(
        content,
        slugMap,
      );
      blocks.push({
        _type: "block",
        _key: crypto.randomUUID(),
        style: "h3",
        markDefs,
        children,
      });
      return;
    }
    if (trimmed.startsWith("## ")) {
      const content = trimmed.replace(/^##\s+/, "");
      const { children, markDefs } = parseInlineMarkdownLinks(
        content,
        slugMap,
      );
      blocks.push({
        _type: "block",
        _key: crypto.randomUUID(),
        style: "h2",
        markDefs,
        children,
      });
      return;
    }
    if (trimmed.startsWith("- ")) {
      const cleaned = trimmed.replace(/^[-*•–]+\s+/, "");
      const { children, markDefs } = parseInlineMarkdownLinks(
        cleaned,
        slugMap,
      );
      blocks.push({
        _type: "block",
        _key: crypto.randomUUID(),
        style: "normal",
        listItem: "bullet",
        level: 1,
        markDefs,
        children,
      });
      return;
    }
    const { children, markDefs } = parseInlineMarkdownLinks(trimmed, slugMap);
    blocks.push({
      _type: "block",
      _key: crypto.randomUUID(),
      style: "normal",
      markDefs,
      children,
    });
  });
  return blocks;
};

const toBulletList = (items) => {
  const listItems = items.map((text) => ({
    _type: "block",
    _key: crypto.randomUUID(),
    style: "normal",
    listItem: "bullet",
    level: 1,
    markDefs: [],
    children: [
      {
        _type: "span",
        _key: crypto.randomUUID(),
        text,
        marks: [],
      },
    ],
  }));
  return listItems;
};

const headingBlock = (text, style = "h3") => ({
  _type: "block",
  _key: crypto.randomUUID(),
  style,
  markDefs: [],
  children: [
    {
      _type: "span",
      _key: crypto.randomUUID(),
      text,
      marks: [],
    },
  ],
});

const normalizeRichText = (value, slugMap) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return toPortableText(value, slugMap);
};

const mergeLayoutBlocks = (target, source, slugMap) => {
  const combined = [...normalizeRichText(target.richText, slugMap)];
  if (source.title) {
    combined.push(headingBlock(source.title));
  }
  combined.push(...normalizeRichText(source.richText, slugMap));
  target.richText = combined;
  return target;
};

const buildCustomUrl = (value, slugMap) => {
  if (!value) return undefined;
  if (typeof value === "string") {
    return {
      _type: "customUrl",
      type: "external",
      external: value,
      openInNewTab: false,
    };
  }
  const type = value.type === "internal" ? "internal" : "external";
  if (type === "internal") {
    const internal = value.internal;
    if (typeof internal === "string" && internal.startsWith("#")) {
      return {
        _type: "customUrl",
        type: "external",
        external: internal,
        openInNewTab: false,
      };
    }
    const ref = slugMap.get(internal);
    if (ref) {
      return {
        _type: "customUrl",
        type: "internal",
        internal: { _type: "reference", _ref: ref },
        openInNewTab: Boolean(value.openInNewTab),
      };
    }
    return {
      _type: "customUrl",
      type: "external",
      external: internal,
      openInNewTab: Boolean(value.openInNewTab),
    };
  }
  return {
    _type: "customUrl",
    type: "external",
    external: value.external || value.url || value.href || "",
    openInNewTab: Boolean(value.openInNewTab),
  };
};

const resolveVariant = (variant, index) => {
  if (variant) return variant;
  if (index === 0) return "default";
  if (index === 1) return "secondary";
  return "outline";
};

const mapButtons = (buttons, slugMap) => {
  if (!Array.isArray(buttons)) return undefined;
  return buttons.map((button, index) => ({
    _type: "button",
    _key: crypto.randomUUID(),
    variant: resolveVariant(button.variant, index),
    text: button.text,
    url: buildCustomUrl(button.url, slugMap),
  }));
};

const buildImageField = (assetId) => {
  if (!assetId) return undefined;
  return {
    _type: "image",
    _key: crypto.randomUUID(),
    asset: { _type: "reference", _ref: assetId },
  };
};

const buildMediaArray = (assetId) => {
  if (!assetId) return undefined;
  return [buildImageField(assetId)];
};

const parseImageNotes = (notes) => {
  if (!notes) return null;
  const match = String(notes).match(/image-[^,\s]+/);
  return match ? match[0] : null;
};

const buildBlock = async (block, slugMap, assetMap, randomAssetId) => {
  const out = { _type: block._type, _key: crypto.randomUUID() };
  for (const [key, value] of Object.entries(block)) {
    if (key === "_type") continue;
    if (key === "richText") {
      out.richText = toPortableText(value, slugMap);
      continue;
    }
    if (key === "subTitle" || key === "helperText") {
      out[key] = toPortableText(value, slugMap);
      continue;
    }
    if (key === "buttons") {
      out.buttons = mapButtons(value, slugMap);
      continue;
    }
    if (key === "media") {
      const filename = value;
      if (filename && assetMap.has(filename)) {
        out.media = buildMediaArray(assetMap.get(filename));
      } else if (!filename && randomAssetId) {
        out.media = buildMediaArray(randomAssetId());
      }
      continue;
    }
    if (key === "cards" && Array.isArray(value)) {
      if (block._type === "imageLinkCards") {
        out.cards = value
          .filter((card) => card.title && card.description)
          .map((card) => ({
            _type: "imageLinkCard",
            _key: crypto.randomUUID(),
            title: card.title,
            description: card.description,
            image:
              card.image ||
              (randomAssetId ? buildImageField(randomAssetId()) : undefined),
            url: buildCustomUrl(card.url, slugMap),
            buttons: mapButtons(card.buttons, slugMap),
          }));
      } else if (block._type === "featureCardsIcon") {
        out.cards = value.map((card) => ({
          _type: "featureCardIcon",
          _key: crypto.randomUUID(),
          title: card.title,
          richText: toPortableText(
            card.richText || card.description || "",
            slugMap,
          ),
          image:
            card.image ||
            (randomAssetId ? buildImageField(randomAssetId()) : undefined),
          icon: card.icon,
        }));
      } else {
        out.cards = value;
      }
      continue;
    }
    if (key === "faqs" && Array.isArray(value)) {
      out.faqs = value.map((id) => ({
        _type: "reference",
        _key: crypto.randomUUID(),
        _ref: id.startsWith("drafts.") ? id : `drafts.${id}`,
      }));
      continue;
    }
    if (key === "filters" && value && typeof value === "object") {
      out.filters = value;
      continue;
    }
    out[key] = value;
  }
  if (
    (block._type === "hero" || block._type === "layout") &&
    !out.media &&
    randomAssetId
  ) {
    out.media = buildMediaArray(randomAssetId());
  }
  return out;
};

const buildPageDoc = async (filePath, slugMap, assetMap, randomAssetId) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const slug = data.slug;
  if (!slug) return null;
  const title = parseTitle(body) || slug.replace(/\//g, " ").trim();
  const blocks = parseBlocksSection(body);
  const pageBuilder = [];
  for (const block of blocks) {
    if (block._type === "featureCardsIcon") {
      const cards = Array.isArray(block.cards) ? block.cards : [];
      const chunkSize = 3;
      const groups = [];
      for (let i = 0; i < cards.length; i += chunkSize) {
        groups.push(cards.slice(i, i + chunkSize));
      }
      groups.forEach((group, index) => {
        if (!group.length) return;
        const title = index === 0 ? block.title || "Benefits" : block.title || "Benefits";
        const lines = group.map((card) => {
          const desc = card.richText || card.description || "";
          return desc ? `${card.title} — ${desc}` : card.title;
        });
        pageBuilder.push({
          _type: "layout",
          _key: crypto.randomUUID(),
          title,
          richText: toBulletList(lines),
          media: randomAssetId ? buildMediaArray(randomAssetId()) : undefined,
        });
      });
      continue;
    }
    pageBuilder.push(await buildBlock(block, slugMap, assetMap, randomAssetId));
  }
  // Enforce layout count: hero + 2-3 layout panels max.
  const layoutIndexes = pageBuilder
    .map((block, index) => (block._type === "layout" ? index : -1))
    .filter((index) => index >= 0);
  if (layoutIndexes.length > 3) {
    const keep = layoutIndexes.slice(0, 3);
    const extra = layoutIndexes.slice(3);
    const lastIndex = keep[keep.length - 1];
    extra.forEach((index) => {
      const target = pageBuilder[lastIndex];
      const source = pageBuilder[index];
      if (target && source) {
        mergeLayoutBlocks(target, source, slugMap);
      }
    });
    // Remove extra layouts (reverse order to keep indexes stable)
    extra
      .slice()
      .sort((a, b) => b - a)
      .forEach((index) => pageBuilder.splice(index, 1));
  }
  // Enforce hero + layout variants per navigation rules.
  let layoutIndex = 0;
  pageBuilder.forEach((block) => {
    if (block._type === "hero") {
      block.variant = "background";
    }
    if (block._type === "layout") {
      block.variant = layoutIndex % 2 === 0 ? "imageRight" : "imageLeft";
      layoutIndex += 1;
    }
  });
  const heroImageFilename = parseImageNotes(data.image_notes);
  let pageImage = null;
  if (heroImageFilename && assetMap.has(heroImageFilename)) {
    pageImage = buildImageField(assetMap.get(heroImageFilename));
  }
  return {
    slug,
    title,
    description: data.seo_description || data.seoDescription || "",
    seoTitle: data.seo_title || undefined,
    seoDescription: data.seo_description || undefined,
    ogTitle: data.og_title || undefined,
    ogDescription: data.og_description || undefined,
    image: pageImage || undefined,
    seoImage: pageImage || undefined,
    pageBuilder,
  };
};

const parseFaqDocs = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const faqs = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- id:")) {
      if (current) faqs.push(current);
      current = { id: trimmed.replace("- id:", "").trim() };
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith("question:")) {
      current.question = trimmed.replace("question:", "").trim();
    } else if (trimmed.startsWith("answer:")) {
      current.answer = trimmed.replace("answer:", "").trim();
    }
  }
  if (current) faqs.push(current);
  return faqs.filter((faq) => faq.id && faq.question && faq.answer);
};

const cleanUrl = (value) => {
  if (!value) return value;
  const trimmed = value.trim();
  const noNote = trimmed.split("(")[0].trim();
  return noNote.split(/\s+/)[0].trim();
};

const parseNavigation = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const columns = [];
  const buttons = [];
  let mode = null;
  let currentColumn = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "## Columns (left to right)") {
      mode = "columns";
      continue;
    }
    if (trimmed === "## Header Buttons (right side)") {
      mode = "buttons";
      continue;
    }
    if (mode === "columns" && trimmed.startsWith("### Column:")) {
      if (currentColumn) columns.push(currentColumn);
      currentColumn = {
        title: trimmed.replace("### Column:", "").trim(),
        links: [],
      };
      continue;
    }
    if (mode === "columns" && trimmed.startsWith("- ")) {
      const entry = trimmed.slice(2).trim();
      const [name, rawUrl] = entry.split("—").map((part) => part.trim());
      const url = cleanUrl(rawUrl);
      if (currentColumn && name && url) {
        currentColumn.links.push({ name, url });
      }
      continue;
    }
    if (mode === "buttons" && trimmed.startsWith("- ")) {
      const entry = trimmed.slice(2).trim();
      const [text, rawUrl] = entry.split("—").map((part) => part.trim());
      const url = cleanUrl(rawUrl);
      if (text && url) {
        buttons.push({ text, url });
      }
    }
  }

  if (currentColumn) columns.push(currentColumn);
  return { columns, buttons };
};

const urlToCustomUrlInput = (url) => {
  if (/^https?:\/\//i.test(url)) {
    return { type: "external", external: url };
  }
  return { type: "internal", internal: url };
};

const main = async () => {
  const slugDocs = await client.fetch(
    `*[_type in ["page","blogIndex","blog"]]{_id, "slug": slug.current}`,
  );
  const draftSlugDocs = await client
    .withConfig({ perspective: "drafts" })
    .fetch(
      `*[_id match "drafts.*" && _type in ["page","blogIndex","blog"]]{_id, "slug": slug.current}`,
    );
  const slugMap = new Map();
  slugDocs.forEach((doc) => {
    if (doc.slug) slugMap.set(doc.slug, doc._id);
  });
  draftSlugDocs.forEach((doc) => {
    if (doc.slug) slugMap.set(doc.slug, doc._id);
  });

  const faqPath = path.join(contentDir, "faqs.md");
  if (fs.existsSync(faqPath)) {
    const faqs = parseFaqDocs(faqPath);
    for (const faq of faqs) {
      const draftId = `drafts.${faq.id}`;
      await client.createOrReplace({
        _id: draftId,
        _type: "faq",
        title: faq.question,
        richText: toPortableText(faq.answer, slugMap),
      });
    }
    console.log(`Upserted ${faqs.length} FAQ drafts.`);
  }

  const files = fs
    .readdirSync(contentDir)
    .filter(
      (file) =>
        file.endsWith(".md") && !["faqs.md", "navigation.md"].includes(file),
    );

  const filenames = new Set();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(contentDir, file), "utf8");
    const { data } = parseFrontmatter(raw);
    const hero = parseImageNotes(data.image_notes);
    if (hero) filenames.add(hero);
    const blocks = parseBlocksSection(raw);
    blocks.forEach((block) => {
      if (block.media && typeof block.media === "string") {
        filenames.add(block.media);
      }
    });
  }

  const assetMap = new Map();
  if (filenames.size > 0) {
    const assetDocs = await client.fetch(
      `*[_type == "sanity.imageAsset" && originalFilename in $filenames]{_id, originalFilename}`,
      { filenames: Array.from(filenames) },
    );
    assetDocs.forEach((doc) => {
      assetMap.set(doc.originalFilename, doc._id);
    });
  }

  const taggedAssetIds = await client.fetch(
    `*[_type == "sanity.imageAsset" &&
      defined(opt.media.tags) &&
      count(opt.media.tags[]->name.current[lower(@) in ["members","gym"]]) > 0
    ]{_id}`,
  );
  const allAssetIds = taggedAssetIds.length
    ? taggedAssetIds
    : await client.fetch(`*[_type == "sanity.imageAsset"]{_id}`);
  const assetIdList = allAssetIds.map((asset) => asset._id);
  const randomAssetId =
    assetIdList.length > 0
      ? () => assetIdList[Math.floor(Math.random() * assetIdList.length)]
      : null;

  let updated = 0;
  for (const file of files) {
    const fullPath = path.join(contentDir, file);
    const page = await buildPageDoc(fullPath, slugMap, assetMap, randomAssetId);
    if (!page) continue;
    const existingId = slugMap.get(page.slug);
    const baseId =
      existingId || `page-${page.slug.replace(/\//g, "-").replace(/^-/, "")}`;
    const draftId = `drafts.${baseId}`;
    console.log(`Upserting ${page.slug} -> ${draftId}`);
    await client.createOrReplace({
      _id: draftId,
      _type: "page",
      title: page.title,
      description: page.description,
      slug: { _type: "slug", current: page.slug },
      image: page.image,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoImage: page.seoImage,
      ogTitle: page.ogTitle,
      ogDescription: page.ogDescription,
      pageBuilder: page.pageBuilder,
    });
    updated += 1;
  }

  console.log(`Upserted ${updated} page drafts.`);

  const navPath = path.join(contentDir, "navigation.md");
  if (fs.existsSync(navPath)) {
    const updatedSlugDocs = await client.fetch(
      `*[_type in ["page","blogIndex","blog"]]{_id, "slug": slug.current}`,
    );
    const updatedDraftSlugDocs = await client
      .withConfig({ perspective: "drafts" })
      .fetch(
        `*[_id match "drafts.*" && _type in ["page","blogIndex","blog"]]{_id, "slug": slug.current}`,
      );
    const updatedSlugMap = new Map();
    updatedSlugDocs.forEach((doc) => {
      if (doc.slug) updatedSlugMap.set(doc.slug, doc._id);
    });
    updatedDraftSlugDocs.forEach((doc) => {
      if (doc.slug) updatedSlugMap.set(doc.slug, doc._id);
    });

    const nav = parseNavigation(navPath);
    const columns = nav.columns.map((column) => ({
      _type: "navbarColumn",
      _key: crypto.randomUUID(),
      title: column.title,
      links: column.links.map((link) => ({
        _type: "navbarColumnLink",
        _key: crypto.randomUUID(),
        name: link.name,
        description: "",
        url: buildCustomUrl(urlToCustomUrlInput(link.url), updatedSlugMap),
      })),
    }));
    const navButtons = mapButtons(
      nav.buttons.map((button) => ({
        text: button.text,
        url: urlToCustomUrlInput(button.url),
      })),
      updatedSlugMap,
    );
    await client.createOrReplace({
      _id: "drafts.navbar",
      _type: "navbar",
      label: "Navbar",
      columns,
      buttons: navButtons,
    });
    console.log("Upserted navbar draft.");
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
