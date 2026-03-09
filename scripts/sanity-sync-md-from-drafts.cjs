#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

let createClient = null;
try {
  ({createClient} = require("@sanity/client"));
} catch {
  ({createClient} = require(path.join(
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
    if (process.env[key] === undefined) process.env[key] = value;
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

if (!projectId) throw new Error("Missing SANITY project ID");
if (!token) throw new Error("Missing SANITY API token");

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const contentDir = path.join(rootDir, "content-specs");

const splitFirst = (value, separator = ":") => {
  const idx = value.indexOf(separator);
  if (idx === -1) return [value, null];
  return [value.slice(0, idx), value.slice(idx + 1)];
};

const parseFrontmatter = (text) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {frontmatterRaw: "", data: {}, body: text};
  const raw = match[1];
  const data = {};
  raw.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const [key, rest] = splitFirst(line);
    if (rest === null) return;
    data[key.trim()] = rest.trim();
  });
  return {
    frontmatterRaw: raw,
    data,
    body: text.slice(match[0].length),
  };
};

const stringifyFrontmatter = (rawData) => {
  const preferredOrder = [
    "slug",
    "seo_title",
    "seo_description",
    "og_title",
    "og_description",
    "primary_keyword",
    "secondary_keywords",
    "image_notes",
    "type",
    "notes",
  ];
  const keys = Object.keys(rawData);
  const ordered = [
    ...preferredOrder.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !preferredOrder.includes(key)),
  ];

  const lines = ordered.map((key) => `${key}: ${rawData[key] ?? ""}`);
  return `---\n${lines.join("\n")}\n---\n`;
};

const replaceSection = (body, heading, sectionContentLines) => {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  const content = sectionContentLines.join("\n");
  if (start === -1) {
    return `${body.replace(/\s*$/, "")}\n\n${heading}\n${content}\n`;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  const nextLines = [
    ...lines.slice(0, start + 1),
    ...sectionContentLines,
    ...lines.slice(end),
  ];
  return `${nextLines.join("\n").replace(/\s+$/, "")}\n`;
};

const replaceFirstH1 = (body, title) => {
  const lines = body.split(/\r?\n/);
  const h1Index = lines.findIndex((line) => line.startsWith("# "));
  if (h1Index >= 0) {
    lines[h1Index] = `# ${title}`;
    return lines.join("\n");
  }
  return `# ${title}\n\n${body}`;
};

const humanizeType = (type) =>
  String(type || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

const toPlainText = (portableText, slugByRef) => {
  if (!Array.isArray(portableText)) return "";
  const lines = [];
  portableText.forEach((node) => {
    if (node?._type === "block") {
      const markDefs = new Map(
        (node.markDefs || []).map((def) => [def._key, def]),
      );
      const text = (node.children || [])
        .map((child) => {
          if (child?._type !== "span") return "";
          const marks = Array.isArray(child.marks) ? child.marks : [];
          let value = child.text || "";
          const linkMark = marks.find((mark) => markDefs.has(mark));
          if (linkMark) {
            const def = markDefs.get(linkMark);
            const link = def?.customLink || def;
            const href =
              link?.type === "internal"
                ? slugByRef.get(link?.internal?._ref) || "#"
                : link?.external || link?.href || "#";
            value = `[${value}](${href})`;
          }
          return value;
        })
        .join("");

      if (!text.trim()) return;
      if (node.listItem === "bullet") {
        lines.push(`- ${text.trim()}`);
        return;
      }
      if (node.style === "h2") {
        lines.push(`## ${text.trim()}`);
        return;
      }
      if (node.style === "h3") {
        lines.push(`### ${text.trim()}`);
        return;
      }
      lines.push(text.trim());
      return;
    }

    if (node?._type === "image") {
      const ref = node?.asset?._ref;
      if (ref) lines.push(ref);
    }
  });
  return lines.join("\n");
};

const stringifyScalar = (value) => {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (value === null) return "null";
  return String(value ?? "");
};

const INTERNAL_HOSTS = new Set(["onelifecrossfit.com", "www.onelifecrossfit.com"]);
const knownSlugs = new Set();

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

const toInlineCustomUrl = (value, slugByRef) => {
  if (!value || typeof value !== "object") return null;
  if (value.type === "internal") {
    const internal = normalizeInternalSlug(slugByRef.get(value?.internal?._ref) || "/");
    return `{ type: internal, internal: ${internal}${value.openInNewTab ? ", openInNewTab: true" : ""} }`;
  }
  const external = value.external || value.href || "#";
  const internalSlug = getInternalSlugCandidate(external);
  if (internalSlug && knownSlugs.has(internalSlug)) {
    return `{ type: internal, internal: ${internalSlug}${value.openInNewTab ? ", openInNewTab: true" : ""} }`;
  }
  return `{ type: external, external: ${external}${value.openInNewTab ? ", openInNewTab: true" : ""} }`;
};

const getAssetRef = (value) => value?.asset?._ref || null;

const renderKeyValue = (key, value, indentLevel, slugByRef) => {
  const pad = " ".repeat(indentLevel);
  const lines = [];

  if (value === undefined) return lines;

  if (key === "richText" || key === "subTitle" || key === "helperText") {
    const text = toPlainText(value, slugByRef);
    if (!text) return lines;
    if (!text.includes("\n")) {
      lines.push(`${pad}- ${key}: ${text}`);
      return lines;
    }
    lines.push(`${pad}- ${key}: |-`);
    text.split("\n").forEach((line) => {
      lines.push(`${pad}  ${line}`);
    });
    return lines;
  }

  if (key === "image") {
    const ref = getAssetRef(value);
    if (ref) lines.push(`${pad}- image: ${ref}`);
    return lines;
  }

  if (key === "media" && Array.isArray(value)) {
    const refs = value.map(getAssetRef).filter(Boolean);
    if (refs.length === 0) return lines;
    if (refs.length === 1) {
      lines.push(`${pad}- media: ${refs[0]}`);
      return lines;
    }
    lines.push(`${pad}- media:`);
    refs.forEach((ref) => lines.push(`${pad}  - ${ref}`));
    return lines;
  }

  if (key === "faqs" && Array.isArray(value)) {
    lines.push(`${pad}- faqs:`);
    value.forEach((item) => {
      const ref = String(item?._ref || "").replace(/^drafts\./, "");
      if (ref) lines.push(`${pad}  - ${ref}`);
    });
    return lines;
  }

  if (key === "buttons" && Array.isArray(value)) {
    lines.push(`${pad}- buttons:`);
    value.forEach((button) => {
      lines.push(`${pad}  - text: ${stringifyScalar(button.text || "")}`);
      if (button.variant) lines.push(`${pad}    variant: ${button.variant}`);
      const inlineUrl = toInlineCustomUrl(button.url, slugByRef);
      if (inlineUrl) lines.push(`${pad}    url: ${inlineUrl}`);
    });
    return lines;
  }

  if (key === "cards" && Array.isArray(value)) {
    lines.push(`${pad}- cards:`);
    value.forEach((card) => {
      lines.push(`${pad}  - title: ${stringifyScalar(card.title || "")}`);
      if (card.description) lines.push(`${pad}    description: ${card.description}`);
      const cardRichText = toPlainText(card.richText, slugByRef);
      if (cardRichText) {
        if (cardRichText.includes("\n")) {
          lines.push(`${pad}    richText: |-`);
          cardRichText.split("\n").forEach((line) => {
            lines.push(`${pad}      ${line}`);
          });
        } else {
          lines.push(`${pad}    richText: ${cardRichText}`);
        }
      }
      const imageRef = getAssetRef(card.image);
      if (imageRef) lines.push(`${pad}    image: ${imageRef}`);
      const inlineUrl = toInlineCustomUrl(card.url, slugByRef);
      if (inlineUrl) lines.push(`${pad}    url: ${inlineUrl}`);
      if (Array.isArray(card.buttons) && card.buttons.length) {
        lines.push(`${pad}    buttons:`);
        card.buttons.forEach((button) => {
          lines.push(`${pad}      - text: ${stringifyScalar(button.text || "")}`);
          if (button.variant) lines.push(`${pad}        variant: ${button.variant}`);
          const url = toInlineCustomUrl(button.url, slugByRef);
          if (url) lines.push(`${pad}        url: ${url}`);
        });
      }
    });
    return lines;
  }

  if (key === "link" && value && typeof value === "object") {
    const out = {
      text: value.text || "",
      description: value.description || "",
      url: toInlineCustomUrl(value.url, slugByRef),
    };
    lines.push(`${pad}- link:`);
    if (out.text) lines.push(`${pad}  - text: ${out.text}`);
    if (out.description) lines.push(`${pad}    description: ${out.description}`);
    if (out.url) lines.push(`${pad}    url: ${out.url}`);
    return lines;
  }

  if (Array.isArray(value)) {
    if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      lines.push(`${pad}- ${key}: ${JSON.stringify(value)}`);
      return lines;
    }
    lines.push(`${pad}- ${key}:`);
    value.forEach((item) => lines.push(`${pad}  - ${JSON.stringify(item)}`));
    return lines;
  }

  if (value && typeof value === "object") {
    if (key === "url") {
      const inline = toInlineCustomUrl(value, slugByRef);
      if (inline) lines.push(`${pad}- url: ${inline}`);
      return lines;
    }
    lines.push(`${pad}- ${key}: ${JSON.stringify(value)}`);
    return lines;
  }

  lines.push(`${pad}- ${key}: ${stringifyScalar(value)}`);
  return lines;
};

const blockFieldOrder = [
  "variant",
  "eyebrow",
  "badge",
  "title",
  "richText",
  "subTitle",
  "helperText",
  "media",
  "image",
  "cards",
  "buttons",
  "faqs",
  "programs",
  "programId",
  "daysToShow",
  "daysAhead",
  "showAvailability",
  "groupByDay",
  "showCoach",
  "showPublicNotes",
  "layout",
  "filters",
  "link",
];

const renderConfigBlock = (block, slugByRef) => {
  const label = block?.title ? ` (${block.title})` : "";
  const lines = [`- ${block._type}${label}`];
  const keys = Object.keys(block || {}).filter((key) => !["_key", "_type"].includes(key));
  const ordered = [
    ...blockFieldOrder.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !blockFieldOrder.includes(key)),
  ];
  ordered.forEach((key) => {
    lines.push(...renderKeyValue(key, block[key], 2, slugByRef));
  });
  return lines;
};

const renderPageBuilderOrdered = (pageBuilder) => {
  const blocks = Array.isArray(pageBuilder) ? pageBuilder : [];
  return blocks.map((block) => {
    const type = block?._type || "block";
    const label = block?.title || humanizeType(type);
    return `- ${type}: ${label}`;
  });
};

const parseContentSpecFiles = () => {
  const files = fs
    .readdirSync(contentDir)
    .filter(
      (file) =>
        file.endsWith(".md") &&
        !["_template.md", "faqs.md", "navigation.md", "media-manifest.md"].includes(file),
    );

  const bySlug = new Map();
  files.forEach((file) => {
    const fullPath = path.join(contentDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const {data} = parseFrontmatter(raw);
    const slug = data.slug;
    if (slug && slug.startsWith("/")) {
      bySlug.set(slug, {file, fullPath});
    }
  });
  return bySlug;
};

const escapeFaqValue = (value) => String(value || "").replace(/\n+/g, " ").trim();

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");
  const draftsClient = client.withConfig({perspective: "drafts"});

  const refDocs = await draftsClient.fetch(
    `*[_type in ["page","blogIndex","blog"] && defined(slug.current)]{_id, "slug": slug.current}`,
  );
  const slugByRef = new Map();
  refDocs.forEach((doc) => {
    const slug = normalizeInternalSlug(doc.slug);
    slugByRef.set(doc._id, doc.slug);
    if (slug) knownSlugs.add(slug);
    if (String(doc._id).startsWith("drafts.")) {
      slugByRef.set(String(doc._id).replace(/^drafts\./, ""), doc.slug);
    } else {
      slugByRef.set(`drafts.${doc._id}`, doc.slug);
    }
  });

  const specFilesBySlug = parseContentSpecFiles();
  const targetSlugs = Array.from(specFilesBySlug.keys());
  const pageDocs = await draftsClient.fetch(
    `*[_type == "page" && slug.current in $slugs]{
      ...,
      "slug": slug.current
    }`,
    {slugs: targetSlugs},
  );

  const pageBySlug = new Map();
  pageDocs.forEach((doc) => {
    const existing = pageBySlug.get(doc.slug);
    if (!existing) {
      pageBySlug.set(doc.slug, doc);
      return;
    }
    const existingDraft = String(existing._id).startsWith("drafts.");
    const currentDraft = String(doc._id).startsWith("drafts.");
    if (!existingDraft && currentDraft) {
      pageBySlug.set(doc.slug, doc);
      return;
    }
    if ((doc._updatedAt || "") > (existing._updatedAt || "")) {
      pageBySlug.set(doc.slug, doc);
    }
  });

  let updatedPages = 0;
  const missingInSanity = [];

  targetSlugs.forEach((slug) => {
    const fileMeta = specFilesBySlug.get(slug);
    const doc = pageBySlug.get(slug);
    if (!doc) {
      missingInSanity.push(slug);
      return;
    }

    const raw = fs.readFileSync(fileMeta.fullPath, "utf8");
    const {data, body} = parseFrontmatter(raw);

    const nextFrontmatter = {...data};
    nextFrontmatter.slug = doc.slug;
    nextFrontmatter.seo_title = doc.seoTitle || "";
    nextFrontmatter.seo_description = doc.seoDescription || doc.description || "";
    nextFrontmatter.og_title = doc.ogTitle || "";
    nextFrontmatter.og_description = doc.ogDescription || "";
    const imageRef = getAssetRef(doc.image);
    if (imageRef) {
      nextFrontmatter.image_notes = imageRef;
    }

    let nextBody = replaceFirstH1(body, doc.title || humanizeType(slug));
    nextBody = replaceSection(
      nextBody,
      "## Page Builder Blocks (ordered)",
      renderPageBuilderOrdered(doc.pageBuilder || []),
    );
    nextBody = replaceSection(
      nextBody,
      "## Blocks (config-ready)",
      (doc.pageBuilder || []).flatMap((block) => renderConfigBlock(block, slugByRef)),
    );

    const nextText = `${stringifyFrontmatter(nextFrontmatter)}\n${nextBody.replace(/^\n+/, "")}`;
    if (!dryRun) {
      fs.writeFileSync(fileMeta.fullPath, nextText.endsWith("\n") ? nextText : `${nextText}\n`);
    }
    updatedPages += 1;
  });

  const faqs = await draftsClient.fetch(`*[_type == "faq"]{...} | order(_id asc)`);
  const faqLines = [
    "---",
    "type: faq-docs",
    "notes: Synced from Sanity FAQ drafts perspective.",
    "---",
    "",
    "# FAQ Documents",
    "",
  ];
  faqs.forEach((faq) => {
    const id = String(faq._id || "").replace(/^drafts\./, "");
    const question = escapeFaqValue(faq.title || "");
    const answer = escapeFaqValue(toPlainText(faq.richText || [], slugByRef));
    if (!id || !question || !answer) return;
    faqLines.push(`- id: ${id}`);
    faqLines.push(`  question: ${question}`);
    faqLines.push(`  answer: ${answer}`);
  });
  const faqPath = path.join(contentDir, "faqs.md");
  if (!dryRun) {
    fs.writeFileSync(faqPath, `${faqLines.join("\n")}\n`);
  }

  const navbar = await draftsClient.fetch(`*[_id in ["drafts.navbar","navbar"]][0]{...}`);
  const navLines = [
    "---",
    "type: navbar",
    "notes: Synced from Sanity navbar draft perspective.",
    "---",
    "",
    "# Site Navigation Draft",
    "",
    "## Columns (left to right)",
    "",
  ];
  const columns = Array.isArray(navbar?.columns) ? navbar.columns : [];
  columns
    .filter((column) => column?._type === "navbarColumn")
    .forEach((column) => {
      navLines.push(`### Column: ${column.title || "Untitled"}`);
      navLines.push("");
      (column.links || []).forEach((link) => {
        const url =
          link?.url?.type === "internal"
            ? slugByRef.get(link?.url?.internal?._ref) || "/"
            : link?.url?.external || "#";
        const description = link?.description ? ` — ${link.description}` : "";
        navLines.push(`- ${link?.name || "Untitled"} — ${url}${description}`);
      });
      navLines.push("");
    });

  navLines.push("## Header Buttons (right side)");
  navLines.push("");
  const buttons = Array.isArray(navbar?.buttons) ? navbar.buttons : [];
  buttons.forEach((button) => {
    const url =
      button?.url?.type === "internal"
        ? slugByRef.get(button?.url?.internal?._ref) || "/"
        : button?.url?.external || "#";
    navLines.push(`- ${button?.text || "Untitled"} — ${url}`);
  });
  navLines.push("");

  const navPath = path.join(contentDir, "navigation.md");
  if (!dryRun) {
    fs.writeFileSync(navPath, navLines.join("\n"));
  }

  console.log(
    `${dryRun ? "Would sync" : "Synced"} ${updatedPages} page md files, ${faqs.length} FAQs, and navbar.`,
  );
  if (missingInSanity.length > 0) {
    console.log(
      `Skipped ${missingInSanity.length} local slug(s) not found in Sanity: ${missingInSanity.join(", ")}`,
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
