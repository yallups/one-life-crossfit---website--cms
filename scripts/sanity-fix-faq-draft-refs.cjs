#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
let createClient;
try {
  ({ createClient } = require("@sanity/client"));
} catch {
  ({ createClient } = require(path.join(
    __dirname,
    "..",
    "apps/studio/node_modules/@sanity/client",
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
    "Missing SANITY_STUDIO_PROJECT_ID/NEXT_PUBLIC_SANITY_PROJECT_ID.",
  );
}
if (!token) {
  throw new Error(
    "Missing SANITY_API_WRITE_TOKEN/SANITY_WRITE_TOKEN/SANITY_API_TOKEN.",
  );
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node scripts/sanity-fix-faq-draft-refs.cjs [--apply]");
  console.log("Default mode is dry-run. Pass --apply to write changes.");
  process.exit(0);
}
const apply = args.has("--apply");

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
  perspective: "raw",
});

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const collectDraftFaqRefs = (pageBuilder) => {
  const refs = [];
  if (!Array.isArray(pageBuilder)) return refs;
  pageBuilder.forEach((block) => {
    if (!isObject(block) || block._type !== "faqAccordion") return;
    if (!Array.isArray(block.faqs)) return;
    block.faqs.forEach((faqRef) => {
      if (!isObject(faqRef) || typeof faqRef._ref !== "string") return;
      if (faqRef._ref.startsWith("drafts.faq-")) {
        refs.push(faqRef._ref);
      }
    });
  });
  return refs;
};

const normalizeFaqAccordionRefs = (pageBuilder, validCanonicalFaqIds) => {
  if (!Array.isArray(pageBuilder)) {
    return {
      changed: false,
      replacements: 0,
      skippedMissing: 0,
      nextPageBuilder: pageBuilder,
    };
  }

  let changed = false;
  let replacements = 0;
  let skippedMissing = 0;

  const nextPageBuilder = pageBuilder.map((block) => {
    if (!isObject(block) || block._type !== "faqAccordion") {
      return block;
    }
    if (!Array.isArray(block.faqs)) {
      return block;
    }

    let blockChanged = false;
    const nextFaqs = block.faqs.map((faqRef) => {
      if (!isObject(faqRef) || typeof faqRef._ref !== "string") {
        return faqRef;
      }
      if (!faqRef._ref.startsWith("drafts.faq-")) {
        return faqRef;
      }

      const normalizedRef = faqRef._ref.replace(/^drafts\./, "");
      if (
        validCanonicalFaqIds &&
        !validCanonicalFaqIds.has(normalizedRef)
      ) {
        skippedMissing += 1;
        return faqRef;
      }
      if (normalizedRef === faqRef._ref) {
        return faqRef;
      }

      blockChanged = true;
      replacements += 1;
      return {
        ...faqRef,
        _ref: normalizedRef,
      };
    });

    if (!blockChanged) {
      return block;
    }

    changed = true;
    return {
      ...block,
      faqs: nextFaqs,
    };
  });

  return { changed, replacements, skippedMissing, nextPageBuilder };
};

const countDraftFaqRefs = (pageBuilder) => {
  if (!Array.isArray(pageBuilder)) return 0;
  let total = 0;
  pageBuilder.forEach((block) => {
    if (!isObject(block) || block._type !== "faqAccordion") return;
    if (!Array.isArray(block.faqs)) return;
    block.faqs.forEach((faqRef) => {
      if (isObject(faqRef) && typeof faqRef._ref === "string") {
        if (faqRef._ref.startsWith("drafts.faq-")) {
          total += 1;
        }
      }
    });
  });
  return total;
};

const run = async () => {
  const docs = await client.fetch(
    `*[_id in path("drafts.**") && defined(pageBuilder)]{
      _id,
      _type,
      title,
      pageBuilder
    }`,
  );

  const draftFaqRefSet = new Set();
  docs.forEach((doc) => {
    collectDraftFaqRefs(doc.pageBuilder).forEach((ref) => draftFaqRefSet.add(ref));
  });
  const draftFaqIds = Array.from(draftFaqRefSet).sort();
  const canonicalFaqIds = draftFaqIds.map((id) => id.replace(/^drafts\./, ""));

  const faqDocs = canonicalFaqIds.length
    ? await client.fetch(
        `*[_type == "faq" && (_id in $canonicalIds || _id in $draftIds)]{
          _id,
          _type,
          title,
          richText
        }`,
        { canonicalIds: canonicalFaqIds, draftIds: draftFaqIds },
      )
    : [];

  const canonicalFaqIdSet = new Set();
  const draftFaqByCanonicalId = new Map();

  faqDocs.forEach((faqDoc) => {
    if (typeof faqDoc?._id !== "string") return;
    if (faqDoc._id.startsWith("drafts.")) {
      draftFaqByCanonicalId.set(faqDoc._id.replace(/^drafts\./, ""), faqDoc);
      return;
    }
    canonicalFaqIdSet.add(faqDoc._id);
  });

  const missingCanonicalFromDraft = canonicalFaqIds.filter(
    (id) => !canonicalFaqIdSet.has(id) && draftFaqByCanonicalId.has(id),
  );
  const missingCanonicalWithoutDraft = canonicalFaqIds.filter(
    (id) => !canonicalFaqIdSet.has(id) && !draftFaqByCanonicalId.has(id),
  );

  let seededCanonicalFaqs = 0;
  if (missingCanonicalFromDraft.length > 0) {
    if (apply) {
      for (const canonicalId of missingCanonicalFromDraft) {
        const draftDoc = draftFaqByCanonicalId.get(canonicalId);
        if (!draftDoc) continue;
        await client.createIfNotExists({
          _id: canonicalId,
          _type: "faq",
          title: draftDoc.title ?? "",
          richText: Array.isArray(draftDoc.richText) ? draftDoc.richText : [],
        });
        canonicalFaqIdSet.add(canonicalId);
        seededCanonicalFaqs += 1;
        console.log(`created ${canonicalId} from drafts.${canonicalId}`);
      }
    } else {
      seededCanonicalFaqs = missingCanonicalFromDraft.length;
      missingCanonicalFromDraft.forEach((canonicalId) => {
        canonicalFaqIdSet.add(canonicalId);
        console.log(`would create ${canonicalId} from drafts.${canonicalId}`);
      });
    }
  }

  let docsChanged = 0;
  let refsReplaced = 0;
  let refsSkippedMissing = 0;

  for (const doc of docs) {
    const { changed, replacements, skippedMissing, nextPageBuilder } =
      normalizeFaqAccordionRefs(doc.pageBuilder, canonicalFaqIdSet);
    if (!changed) continue;

    docsChanged += 1;
    refsReplaced += replacements;
    refsSkippedMissing += skippedMissing;

    if (apply) {
      await client
        .patch(doc._id)
        .set({ pageBuilder: nextPageBuilder })
        .commit({ autoGenerateArrayKeys: false });
      console.log(
        `updated ${doc._id} (${doc._type}) - replaced ${replacements} faq refs`,
      );
    } else {
      console.log(
        `would update ${doc._id} (${doc._type}) - replace ${replacements} faq refs`,
      );
    }
  }

  const latestDocs = apply
    ? await client.fetch(
        `*[_id in path("drafts.**") && defined(pageBuilder)]{
          _id,
          pageBuilder
        }`,
      )
    : docs;
  const remainingDraftFaqRefs = latestDocs.reduce(
    (sum, doc) => sum + countDraftFaqRefs(doc.pageBuilder),
    0,
  );

  console.log("");
  console.log(`mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`draft docs scanned: ${docs.length}`);
  console.log(`draft faq refs found: ${draftFaqIds.length}`);
  console.log(`canonical faq docs seeded: ${seededCanonicalFaqs}`);
  console.log(`draft docs changed: ${docsChanged}`);
  console.log(`faq refs normalized: ${refsReplaced}`);
  console.log(`faq refs skipped (missing canonical): ${refsSkippedMissing}`);
  if (missingCanonicalWithoutDraft.length > 0) {
    console.log(
      `missing canonical+draft FAQ docs: ${missingCanonicalWithoutDraft.length}`,
    );
    missingCanonicalWithoutDraft.forEach((id) => console.log(`  - ${id}`));
  }
  console.log(`remaining drafts.faq-* refs: ${remainingDraftFaqRefs}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
