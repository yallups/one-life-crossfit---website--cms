#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const contentDir = path.join(rootDir, "content-specs");
const APPLY = new Set(process.argv.slice(2)).has("--apply");
const INTERNAL_HOSTS = new Set(["onelifecrossfit.com", "www.onelifecrossfit.com"]);

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

const getKnownSlugs = () => {
  const slugs = new Set();
  const files = fs.readdirSync(contentDir).filter((file) => file.endsWith(".md"));
  files.forEach((file) => {
    const fullPath = path.join(contentDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const match = raw.match(/^slug:\s*(.+)$/m);
    const slug = normalizeInternalSlug(match?.[1] || "");
    if (slug && slug.startsWith("/")) {
      slugs.add(slug);
    }
  });
  return slugs;
};

const main = () => {
  const knownSlugs = getKnownSlugs();
  const files = fs
    .readdirSync(contentDir)
    .filter(
      (file) =>
        file.endsWith(".md") &&
        !["faqs.md", "navigation.md", "media-manifest.md"].includes(file),
    )
    .sort();

  const changedFiles = [];
  let totalChanges = 0;

  files.forEach((file) => {
    const fullPath = path.join(contentDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const changes = [];
    const next = raw.replace(
      /\{ type: external, external: ([^,} ]+)(, openInNewTab: true)? \}/g,
      (match, rawTarget, openInNewTabClause = "") => {
        const slug = getInternalSlugCandidate(rawTarget);
        if (!slug || !knownSlugs.has(slug)) return match;
        changes.push({ from: rawTarget, to: slug });
        return `{ type: internal, internal: ${slug}${openInNewTabClause} }`;
      },
    );

    if (next === raw) return;
    if (APPLY) {
      fs.writeFileSync(fullPath, next);
    }
    changedFiles.push({
      file,
      changes,
    });
    totalChanges += changes.length;
  });

  if (!changedFiles.length) {
    console.log("No local content-spec links needed normalization.");
    return;
  }

  console.log(
    `${APPLY ? "Normalized" : "Would normalize"} ${totalChanges} internal link${totalChanges === 1 ? "" : "s"} across ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}.`,
  );
  changedFiles.forEach(({ file, changes }) => {
    console.log(`- ${path.join("content-specs", file)} (${changes.length})`);
    changes.forEach((change) => {
      console.log(`  - ${change.from} -> ${change.to}`);
    });
  });
};

main();
