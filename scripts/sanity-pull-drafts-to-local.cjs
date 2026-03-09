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

if (!projectId) throw new Error("Missing SANITY project ID");
if (!token) throw new Error("Missing SANITY API token");

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const slugToFilename = (slug) =>
  slug
    .replace(/^\//, "")
    .replace(/[\/\s]+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase() || "home";

const main = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(rootDir, "content-backups", `sanity-pull-${timestamp}`);
  const pagesDir = path.join(outDir, "pages");
  ensureDir(outDir);
  ensureDir(pagesDir);

  const draftsClient = client.withConfig({ perspective: "drafts" });

  const pages = await draftsClient.fetch(
    `*[_type == "page"] | order(slug.current asc){
      ...,
      "slug": slug.current
    }`,
  );

  const faqs = await draftsClient.fetch(
    `*[_type == "faq"] | order(_id asc){
      ...
    }`,
  );

  const navbar = await draftsClient.fetch(
    `*[_id in ["drafts.navbar","navbar"]][0]{...}`,
  );

  pages.forEach((page) => {
    const filename = `${slugToFilename(page.slug || page._id || "untitled")}.json`;
    fs.writeFileSync(
      path.join(pagesDir, filename),
      `${JSON.stringify(page, null, 2)}\n`,
    );
  });

  fs.writeFileSync(path.join(outDir, "pages.json"), `${JSON.stringify(pages, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "faqs.json"), `${JSON.stringify(faqs, null, 2)}\n`);
  fs.writeFileSync(
    path.join(outDir, "navbar.json"),
    `${JSON.stringify(navbar || null, null, 2)}\n`,
  );

  const summaryLines = [
    "# Sanity Pull Summary",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Dataset: ${dataset}`,
    `- Pages pulled: ${pages.length}`,
    `- FAQs pulled: ${faqs.length}`,
    `- Navbar present: ${navbar ? "yes" : "no"}`,
    "",
    "## Page Slugs",
    ...pages.map((page) => `- ${page.slug || "(missing slug)"} (${page._id})`),
  ];
  fs.writeFileSync(path.join(outDir, "summary.md"), `${summaryLines.join("\n")}\n`);

  const relativeOutDir = path.relative(rootDir, outDir);
  console.log(`Pulled Sanity drafts to ${relativeOutDir}`);
  console.log(`Pages: ${pages.length}, FAQs: ${faqs.length}, Navbar: ${navbar ? 1 : 0}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
