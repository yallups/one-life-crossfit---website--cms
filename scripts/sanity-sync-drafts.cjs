#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
  process.env.SANITY_API_TOKEN;

if (!projectId) {
  throw new Error(
    "Missing SANITY_STUDIO_PROJECT_ID/NEXT_PUBLIC_SANITY_PROJECT_ID. Ensure your .env files are present.",
  );
}
if (!token) {
  throw new Error(
    "Missing SANITY_API_WRITE_TOKEN/SANITY_WRITE_TOKEN/SANITY_API_TOKEN.",
  );
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const args = new Set(process.argv.slice(2));
const SYNC_OPTIONS = {
  dryRun: args.has("--dry-run") || args.has("--dry"),
  skipFaqs: args.has("--skip-faqs"),
  skipPages: args.has("--skip-pages"),
  skipNavbar: args.has("--skip-navbar"),
};

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
    };
  }
  const withOpenInNewTab = (urlValue, target) =>
    urlValue.openInNewTab === undefined
      ? target
      : {
          ...target,
          openInNewTab: Boolean(urlValue.openInNewTab),
        };
  const type = value.type === "internal" ? "internal" : "external";
  if (type === "internal") {
    const internal = value.internal;
    if (typeof internal === "string" && internal.startsWith("#")) {
      return withOpenInNewTab(value, {
        _type: "customUrl",
        type: "external",
        external: internal,
      });
    }
    const ref = slugMap.get(internal);
    if (ref) {
      return withOpenInNewTab(value, {
        _type: "customUrl",
        type: "internal",
        internal: { _type: "reference", _ref: ref },
      });
    }
    return withOpenInNewTab(value, {
      _type: "customUrl",
      type: "external",
      external: internal,
    });
  }
  return withOpenInNewTab(value, {
    _type: "customUrl",
    type: "external",
    external: value.external || value.url || value.href || "",
  });
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

const buildFileField = (assetId, itemType = "video") => {
  if (!assetId) return undefined;
  return {
    _type: itemType,
    _key: crypto.randomUUID(),
    asset: { _type: "reference", _ref: assetId },
  };
};

const isSanityAssetId = (value) => {
  if (typeof value !== "string") return false;
  return (
    /^image-[a-f0-9]+-\d+x\d+-[a-z0-9]+$/i.test(value) ||
    /^file-[a-f0-9]+-[a-z0-9]+$/i.test(value)
  );
};

const resolveAssetReference = (value, assetMap) => {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;

  if (isSanityAssetId(token)) {
    if (token.startsWith("image-")) {
      return { id: token, type: "image", originalFilename: token };
    }
    return { id: token, type: "file", originalFilename: token };
  }

  return assetMap.get(token) || null;
};

const buildImageFieldFromValue = (value, assetMap) => {
  if (!value) return undefined;
  if (typeof value === "object") return value;

  const asset = resolveAssetReference(value, assetMap);
  if (!asset || asset.type !== "image") return undefined;
  return buildImageField(asset.id);
};

const buildMediaArrayFromValue = (value, assetMap) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;

  const asset = resolveAssetReference(value, assetMap);
  if (!asset) return undefined;
  if (asset.type === "image") return buildMediaArray(asset.id);
  if (asset.type === "file") {
    const itemType = asset.mimeType?.startsWith("video/") ? "video" : "file";
    return [buildFileField(asset.id, itemType)];
  }
  return undefined;
};

const ASSET_TOKEN_PATTERN =
  /(?:image|file)-[^,\s)]+|[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp|gif|avif|heic|mp4|mov|webm|m4v|svg|pdf)/gi;

const extractAssetTokens = (value) => {
  if (typeof value !== "string") return [];
  const matches = value.match(ASSET_TOKEN_PATTERN);
  if (!matches) return [];
  return matches
    .map((match) => match.trim().replace(/[.,;:!?]+$/, ""))
    .filter(Boolean);
};

const parseImageNotes = (notes) => {
  if (!notes) return null;
  return extractAssetTokens(String(notes))[0] || null;
};

const collectAssetTokensFromValue = (value, tokens) => {
  if (!value) return;
  if (typeof value === "string") {
    extractAssetTokens(value).forEach((token) => tokens.add(token));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetTokensFromValue(item, tokens));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectAssetTokensFromValue(item, tokens));
  }
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
      const mediaValue = buildMediaArrayFromValue(value, assetMap);
      if (mediaValue) {
        out.media = mediaValue;
      }
      continue;
    }
    if (key === "image") {
      const imageValue = buildImageFieldFromValue(value, assetMap);
      if (imageValue) {
        out.image = imageValue;
      } else if (value && typeof value === "object") {
        out.image = value;
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
            image: buildImageFieldFromValue(card.image, assetMap) || card.image,
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
          image: buildImageFieldFromValue(card.image, assetMap) || card.image,
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
        _ref: String(id).replace(/^drafts\./, ""),
      }));
      continue;
    }
    if (key === "filters" && value && typeof value === "object") {
      out.filters = value;
      continue;
    }
    out[key] = value;
  }
  // Do not auto-fill media; images are managed manually.
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
  const heroImageToken = parseImageNotes(data.image_notes);
  let pageImage = null;
  const heroAsset = resolveAssetReference(heroImageToken, assetMap);
  if (heroAsset?.type === "image") {
    pageImage = buildImageField(heroAsset.id);
  }
  const toOptionalText = (value) =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;

  const pageDoc = {
    slug,
    title,
    pageBuilder,
  };

  const description =
    toOptionalText(data.seo_description) || toOptionalText(data.seoDescription);
  if (description) {
    pageDoc.description = description;
  }

  const seoTitle = toOptionalText(data.seo_title);
  if (seoTitle) {
    pageDoc.seoTitle = seoTitle;
  }
  const seoDescription = toOptionalText(data.seo_description);
  if (seoDescription) {
    pageDoc.seoDescription = seoDescription;
  }
  const ogTitle = toOptionalText(data.og_title);
  if (ogTitle) {
    pageDoc.ogTitle = ogTitle;
  }
  const ogDescription = toOptionalText(data.og_description);
  if (ogDescription) {
    pageDoc.ogDescription = ogDescription;
  }
  if (pageImage) {
    pageDoc.image = pageImage;
    pageDoc.seoImage = pageImage;
  }

  return pageDoc;
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

const stripInvisibleCharacters = (value) =>
  String(value).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");

const normalizeOptionalText = (value) => {
  if (typeof value !== "string") return undefined;
  const sanitizedValue = stripInvisibleCharacters(value).trim();
  return sanitizedValue.length > 0 ? sanitizedValue : undefined;
};

const cleanUrl = (value) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return undefined;
  const noNote = normalized.split("(")[0].trim();
  const firstToken = noNote.split(/\s+/)[0]?.trim();
  return firstToken || undefined;
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
      const [rawName, rawUrl, ...rawDescription] = entry
        .split(/[—–]/)
        .map((part) => part.trim());
      const name = normalizeOptionalText(rawName);
      const url = cleanUrl(rawUrl);
      const description = normalizeOptionalText(rawDescription.join(" — "));
      if (currentColumn && name && url) {
        currentColumn.links.push(
          description ? { name, url, description } : { name, url },
        );
      }
      continue;
    }
    if (mode === "buttons" && trimmed.startsWith("- ")) {
      const entry = trimmed.slice(2).trim();
      const [rawText, rawUrl] = entry.split(/[—–]/).map((part) => part.trim());
      const text = normalizeOptionalText(rawText);
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

const getImageAssetRef = (imageField) => imageField?.asset?._ref;

const preserveImageTransforms = (generatedImage, existingImage) => {
  if (!generatedImage || !existingImage) return generatedImage;
  const generatedRef = getImageAssetRef(generatedImage);
  const existingRef = getImageAssetRef(existingImage);
  if (!generatedRef || !existingRef || generatedRef !== existingRef) {
    return generatedImage;
  }

  const mergedImage = { ...generatedImage };
  if (!mergedImage.crop && existingImage.crop) {
    mergedImage.crop = existingImage.crop;
  }
  if (!mergedImage.hotspot && existingImage.hotspot) {
    mergedImage.hotspot = existingImage.hotspot;
  }
  return mergedImage;
};

const preserveMediaTransforms = (generatedMedia, existingMedia) => {
  if (!Array.isArray(generatedMedia) || !Array.isArray(existingMedia)) {
    return generatedMedia;
  }

  const existingByAssetAndType = new Map();
  existingMedia.forEach((item) => {
    const assetRef = item?.asset?._ref;
    if (!assetRef || !item?._type) return;
    existingByAssetAndType.set(`${item._type}:${assetRef}`, item);
  });

  return generatedMedia.map((item) => {
    if (!item || item._type !== "image") return item;
    const assetRef = item?.asset?._ref;
    if (!assetRef) return item;
    const existingItem = existingByAssetAndType.get(`${item._type}:${assetRef}`);
    if (!existingItem) return item;
    return preserveImageTransforms(item, existingItem);
  });
};

const normalizeMatchValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const findBestBlockMatch = (generatedBlock, existingBlocks, usedIndexes, index) => {
  if (!Array.isArray(existingBlocks)) return null;
  const generatedType = generatedBlock?._type;
  const generatedTitle = normalizeMatchValue(generatedBlock?.title);

  const sameIndex = existingBlocks[index];
  if (
    sameIndex &&
    !usedIndexes.has(index) &&
    sameIndex._type === generatedType &&
    (generatedTitle ? normalizeMatchValue(sameIndex.title) === generatedTitle : true)
  ) {
    usedIndexes.add(index);
    return sameIndex;
  }

  const preferred = existingBlocks.find((block, candidateIndex) => {
    if (usedIndexes.has(candidateIndex)) return false;
    if (!block || block._type !== generatedType) return false;
    if (!generatedTitle) return true;
    return normalizeMatchValue(block.title) === generatedTitle;
  });

  if (preferred) {
    const preferredIndex = existingBlocks.indexOf(preferred);
    usedIndexes.add(preferredIndex);
    return preferred;
  }

  return null;
};

const findBestCardMatch = (generatedCard, existingCards, usedIndexes, index) => {
  if (!Array.isArray(existingCards)) return null;
  const generatedTitle = normalizeMatchValue(generatedCard?.title);

  const sameIndex = existingCards[index];
  if (
    sameIndex &&
    !usedIndexes.has(index) &&
    (generatedTitle ? normalizeMatchValue(sameIndex.title) === generatedTitle : true)
  ) {
    usedIndexes.add(index);
    return sameIndex;
  }

  const preferred = existingCards.find((card, candidateIndex) => {
    if (usedIndexes.has(candidateIndex)) return false;
    if (!generatedTitle) return true;
    return normalizeMatchValue(card?.title) === generatedTitle;
  });
  if (!preferred) return null;
  const preferredIndex = existingCards.indexOf(preferred);
  usedIndexes.add(preferredIndex);
  return preferred;
};

const mergeGeneratedBlockWithExisting = (generatedBlock, existingBlock) => {
  if (!existingBlock) return generatedBlock;

  const mergedBlock = {
    ...existingBlock,
    ...generatedBlock,
    _type: generatedBlock._type,
    _key: generatedBlock._key,
  };

  if (
    generatedBlock.media === undefined &&
    Array.isArray(existingBlock.media) &&
    existingBlock.media.length
  ) {
    mergedBlock.media = existingBlock.media;
  } else if (generatedBlock.media && existingBlock.media) {
    mergedBlock.media = preserveMediaTransforms(generatedBlock.media, existingBlock.media);
  }

  if (generatedBlock.image === undefined && existingBlock.image) {
    mergedBlock.image = existingBlock.image;
  } else if (generatedBlock.image && existingBlock.image) {
    mergedBlock.image = preserveImageTransforms(generatedBlock.image, existingBlock.image);
  }

  if (Array.isArray(mergedBlock.cards) && Array.isArray(existingBlock.cards)) {
    const usedCardIndexes = new Set();
    mergedBlock.cards = mergedBlock.cards.map((generatedCard, cardIndex) => {
      const existingCard = findBestCardMatch(
        generatedCard,
        existingBlock.cards,
        usedCardIndexes,
        cardIndex,
      );
      if (!existingCard) return generatedCard;

      const mergedCard = {
        ...existingCard,
        ...generatedCard,
        _type: generatedCard._type,
        _key: generatedCard._key,
      };
      if (generatedCard.image === undefined && existingCard.image) {
        mergedCard.image = existingCard.image;
      } else if (generatedCard.image && existingCard.image) {
        mergedCard.image = preserveImageTransforms(generatedCard.image, existingCard.image);
      }
      return mergedCard;
    });
  }

  return mergedBlock;
};

const mergeGeneratedPageWithExisting = (generatedPage, existingDraft) => {
  if (!existingDraft) return generatedPage;

  const mergedPage = { ...existingDraft, ...generatedPage };
  if (generatedPage.image === undefined && existingDraft.image) {
    mergedPage.image = existingDraft.image;
  } else if (generatedPage.image && existingDraft.image) {
    mergedPage.image = preserveImageTransforms(generatedPage.image, existingDraft.image);
  }

  if (generatedPage.seoImage === undefined && existingDraft.seoImage) {
    mergedPage.seoImage = existingDraft.seoImage;
  } else if (generatedPage.seoImage && existingDraft.seoImage) {
    mergedPage.seoImage = preserveImageTransforms(
      generatedPage.seoImage,
      existingDraft.seoImage,
    );
  }

  const existingBlocks = Array.isArray(existingDraft.pageBuilder)
    ? existingDraft.pageBuilder
    : [];
  const usedBlockIndexes = new Set();
  mergedPage.pageBuilder = (mergedPage.pageBuilder || []).map(
    (generatedBlock, blockIndex) => {
      const existingBlock = findBestBlockMatch(
        generatedBlock,
        existingBlocks,
        usedBlockIndexes,
        blockIndex,
      );
      return mergeGeneratedBlockWithExisting(generatedBlock, existingBlock);
    },
  );

  return mergedPage;
};

const pickExistingNavbarLink = (existingLinks, name, index) => {
  if (!Array.isArray(existingLinks)) return null;
  const normalizedName = normalizeMatchValue(name);

  const sameIndex = existingLinks[index];
  if (
    sameIndex &&
    normalizeMatchValue(sameIndex.name) === normalizedName
  ) {
    return sameIndex;
  }

  return (
    existingLinks.find(
      (link) => normalizeMatchValue(link?.name) === normalizedName,
    ) || null
  );
};

const pickExistingNavbarColumn = (existingColumns, title, index) => {
  if (!Array.isArray(existingColumns)) return null;
  const normalizedTitle = normalizeMatchValue(title);

  const sameIndex = existingColumns[index];
  if (
    sameIndex &&
    normalizeMatchValue(sameIndex.title) === normalizedTitle
  ) {
    return sameIndex;
  }

  return (
    existingColumns.find(
      (column) => normalizeMatchValue(column?.title) === normalizedTitle,
    ) || null
  );
};

const pickExistingButton = (existingButtons, text, index) => {
  if (!Array.isArray(existingButtons)) return null;
  const normalizedText = normalizeMatchValue(text);

  const sameIndex = existingButtons[index];
  if (
    sameIndex &&
    normalizeMatchValue(sameIndex.text) === normalizedText
  ) {
    return sameIndex;
  }

  return (
    existingButtons.find(
      (button) => normalizeMatchValue(button?.text) === normalizedText,
    ) || null
  );
};

const stripSystemFields = (doc) => {
  if (!doc || typeof doc !== "object") return {};
  const cleaned = {};
  Object.entries(doc).forEach(([key, value]) => {
    if (key.startsWith("_")) return;
    cleaned[key] = value;
  });
  return cleaned;
};

const mergeCustomUrlWithExisting = (generatedUrl, existingUrl) => {
  if (!generatedUrl) return existingUrl;
  if (!existingUrl) return generatedUrl;
  const mergedUrl = { ...existingUrl, ...generatedUrl };
  if (generatedUrl.openInNewTab === undefined && existingUrl.openInNewTab !== undefined) {
    mergedUrl.openInNewTab = existingUrl.openInNewTab;
  }
  return mergedUrl;
};

const mergeGeneratedNavbarWithExisting = (generatedNavbar, existingNavbar) => {
  if (!existingNavbar) return generatedNavbar;

  const existingColumns = Array.isArray(existingNavbar.columns)
    ? existingNavbar.columns
    : [];
  const mergedColumns = (generatedNavbar.columns || []).map((generatedColumn, columnIndex) => {
    const existingColumn = pickExistingNavbarColumn(
      existingColumns,
      generatedColumn?.title,
      columnIndex,
    );
    if (!existingColumn) return generatedColumn;

    const existingLinks = Array.isArray(existingColumn.links) ? existingColumn.links : [];
    const mergedLinks = (generatedColumn.links || []).map((generatedLink, linkIndex) => {
      const existingLink = pickExistingNavbarLink(
        existingLinks,
        generatedLink?.name,
        linkIndex,
      );
      if (!existingLink) return generatedLink;

      const mergedLink = {
        ...existingLink,
        ...generatedLink,
        _type: generatedLink._type,
        _key: generatedLink._key,
      };
      mergedLink.url = mergeCustomUrlWithExisting(generatedLink.url, existingLink.url);
      const description = normalizeOptionalText(mergedLink.description);
      if (description) {
        mergedLink.description = description;
      } else {
        delete mergedLink.description;
      }
      return mergedLink;
    });

    return {
      ...existingColumn,
      ...generatedColumn,
      _type: generatedColumn._type,
      _key: generatedColumn._key,
      links: mergedLinks,
    };
  });

  const existingButtons = Array.isArray(existingNavbar.buttons) ? existingNavbar.buttons : [];
  const mergedButtons = (generatedNavbar.buttons || []).map((generatedButton, buttonIndex) => {
    const existingButton = pickExistingButton(
      existingButtons,
      generatedButton?.text,
      buttonIndex,
    );
    if (!existingButton) return generatedButton;
    return {
      ...existingButton,
      ...generatedButton,
      _type: generatedButton._type,
      _key: generatedButton._key,
      url: mergeCustomUrlWithExisting(generatedButton.url, existingButton.url),
    };
  });

  return {
    ...existingNavbar,
    ...generatedNavbar,
    columns: mergedColumns,
    buttons: mergedButtons,
  };
};

const main = async () => {
  const draftsClient = client.withConfig({ perspective: "drafts" });
  const upsertDoc = async (doc, label) => {
    if (SYNC_OPTIONS.dryRun) {
      console.log(`[dry-run] Would upsert ${label}: ${doc._id}`);
      return;
    }
    await client.createOrReplace(doc);
  };

  if (SYNC_OPTIONS.dryRun) {
    console.log("Running in dry-run mode. No Sanity writes will be made.");
  }

  const slugDocs = await client.fetch(
    `*[_type in ["page","blogIndex","blog"]]{_id, "slug": slug.current}`,
  );
  const draftSlugDocs = await draftsClient.fetch(
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
  if (SYNC_OPTIONS.skipFaqs) {
    console.log("Skipping FAQ sync (--skip-faqs).");
  } else if (fs.existsSync(faqPath)) {
    const faqs = parseFaqDocs(faqPath);
    const existingFaqDocs = await draftsClient.fetch(`*[_type == "faq"]{...}`);
    const existingFaqById = new Map();
    existingFaqDocs.forEach((doc) => {
      existingFaqById.set(doc._id, doc);
      if (String(doc._id).startsWith("drafts.")) {
        existingFaqById.set(String(doc._id).replace(/^drafts\./, ""), doc);
      } else {
        existingFaqById.set(`drafts.${doc._id}`, doc);
      }
    });

    for (const faq of faqs) {
      const draftId = `drafts.${faq.id}`;
      const existingFaq =
        existingFaqById.get(draftId) || existingFaqById.get(faq.id) || null;
      const faqDoc = {
        ...stripSystemFields(existingFaq),
        _id: draftId,
        _type: "faq",
        title: faq.question,
        richText: toPortableText(faq.answer, slugMap),
      };
      await upsertDoc(faqDoc, `faq ${faq.id}`);
    }
    console.log(
      `${SYNC_OPTIONS.dryRun ? "Would upsert" : "Upserted"} ${faqs.length} FAQ drafts.`,
    );
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
    const { data, body } = parseFrontmatter(raw);
    collectAssetTokensFromValue(data.image_notes, filenames);
    collectAssetTokensFromValue(data.hero_image_notes, filenames);
    const blocks = parseBlocksSection(body);
    blocks.forEach((block) => collectAssetTokensFromValue(block, filenames));
  }

  const assetMap = new Map();
  const filenameTokens = Array.from(filenames).filter(
    (token) => !isSanityAssetId(token),
  );
  if (filenameTokens.length > 0) {
    const assetDocs = await client.fetch(
      `*[_type in ["sanity.imageAsset","sanity.fileAsset"] && originalFilename in $filenames]{
        _id,
        _type,
        originalFilename,
        mimeType
      }`,
      { filenames: filenameTokens },
    );
    assetDocs.forEach((doc) => {
      assetMap.set(doc.originalFilename, {
        id: doc._id,
        type: doc._type === "sanity.imageAsset" ? "image" : "file",
        mimeType: doc.mimeType,
        originalFilename: doc.originalFilename,
      });
    });
  }
  const unresolvedTokens = filenameTokens.filter((token) => !assetMap.has(token));
  if (unresolvedTokens.length > 0) {
    console.log(
      `Warning: ${unresolvedTokens.length} media token(s) did not match an asset filename.`,
    );
    unresolvedTokens.slice(0, 10).forEach((token) => {
      console.log(`  - ${token}`);
    });
  }

  if (SYNC_OPTIONS.skipPages) {
    console.log("Skipping page sync (--skip-pages).");
  } else {
    const existingPageDocs = await draftsClient.fetch(
      `*[_type == "page"]{..., "slug": slug.current}`,
    );
    const existingPagesBySlug = new Map();
    const existingPagesById = new Map();
    existingPageDocs.forEach((doc) => {
      if (doc.slug) {
        existingPagesBySlug.set(doc.slug, doc);
      }
      existingPagesById.set(doc._id, doc);
      if (String(doc._id).startsWith("drafts.")) {
        existingPagesById.set(String(doc._id).replace(/^drafts\./, ""), doc);
      } else {
        existingPagesById.set(`drafts.${doc._id}`, doc);
      }
    });

    let updated = 0;
    for (const file of files) {
      const fullPath = path.join(contentDir, file);
      const page = await buildPageDoc(fullPath, slugMap, assetMap, null);
      if (!page) continue;

      const existingId = slugMap.get(page.slug);
      const baseId =
        existingId || `page-${page.slug.replace(/\//g, "-").replace(/^-/, "")}`;
      const normalizedBaseId = String(baseId).replace(/^drafts\./, "");
      const draftId = `drafts.${normalizedBaseId}`;
      const existingPage =
        existingPagesById.get(draftId) ||
        existingPagesById.get(normalizedBaseId) ||
        existingPagesBySlug.get(page.slug) ||
        null;

      const mergedPage = mergeGeneratedPageWithExisting(page, existingPage);
      const pageDoc = {
        ...stripSystemFields(existingPage),
        _id: draftId,
        _type: "page",
        title: mergedPage.title,
        description: mergedPage.description,
        slug: { _type: "slug", current: page.slug },
        image: mergedPage.image,
        seoTitle: mergedPage.seoTitle,
        seoDescription: mergedPage.seoDescription,
        seoImage: mergedPage.seoImage,
        ogTitle: mergedPage.ogTitle,
        ogDescription: mergedPage.ogDescription,
        pageBuilder: mergedPage.pageBuilder,
      };
      await upsertDoc(pageDoc, `page ${page.slug}`);
      updated += 1;
    }

    console.log(
      `${SYNC_OPTIONS.dryRun ? "Would upsert" : "Upserted"} ${updated} page drafts.`,
    );
  }

  const navPath = path.join(contentDir, "navigation.md");
  if (SYNC_OPTIONS.skipNavbar) {
    console.log("Skipping navbar sync (--skip-navbar).");
  } else if (fs.existsSync(navPath)) {
    const updatedSlugDocs = await client.fetch(
      `*[_type in ["page","blogIndex","blog"]]{_id, "slug": slug.current}`,
    );
    const updatedDraftSlugDocs = await draftsClient.fetch(
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
      title: normalizeOptionalText(column.title) || "Untitled",
      links: column.links
        .map((link) => {
          const name = normalizeOptionalText(link.name);
          const url = cleanUrl(link.url);
          if (!name || !url) {
            return null;
          }

          const description = normalizeOptionalText(link.description);
          return {
            _type: "navbarColumnLink",
            _key: crypto.randomUUID(),
            name,
            ...(description ? { description } : {}),
            url: buildCustomUrl(urlToCustomUrlInput(url), updatedSlugMap),
          };
        })
        .filter(Boolean),
    }));
    const navButtons = mapButtons(
      nav.buttons
        .map((button) => {
          const text = normalizeOptionalText(button.text);
          const url = cleanUrl(button.url);
          if (!text || !url) {
            return null;
          }

          return {
            text,
            url: urlToCustomUrlInput(url),
          };
        })
        .filter(Boolean),
      updatedSlugMap,
    );

    const existingNavbar =
      (await draftsClient.fetch(`*[_id in ["navbar","drafts.navbar"]][0]{...}`)) ||
      null;
    const generatedNavbar = {
      _id: "drafts.navbar",
      _type: "navbar",
      columns,
      buttons: navButtons,
    };
    const mergedNavbar = mergeGeneratedNavbarWithExisting(
      generatedNavbar,
      existingNavbar,
    );
    const navbarDoc = {
      ...stripSystemFields(existingNavbar),
      ...mergedNavbar,
      _id: "drafts.navbar",
      _type: "navbar",
      label:
        normalizeOptionalText(mergedNavbar.label) ||
        normalizeOptionalText(existingNavbar?.label) ||
        "Navbar",
    };
    await upsertDoc(navbarDoc, "navbar");
    console.log(`${SYNC_OPTIONS.dryRun ? "Would upsert" : "Upserted"} navbar draft.`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
