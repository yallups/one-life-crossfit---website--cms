#!/usr/bin/env node
const { createClient } = require("@sanity/client");
const fs = require("fs");
const path = require("path");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] ?? "";
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
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

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
  perspective: "drafts",
  ...(process.env.SANITY_API_HOST
    ? { apiHost: process.env.SANITY_API_HOST }
    : {}),
});

const isObject = (value) => value && typeof value === "object";
const isString = (value) => typeof value === "string";
const isNumber = (value) => typeof value === "number" && !Number.isNaN(value);
const isBoolean = (value) => typeof value === "boolean";

const errors = [];
const reportDir = path.join(rootDir, "scripts");
const reportJsonPath = path.join(reportDir, "sanity-draft-errors.json");
const reportMdPath = path.join(reportDir, "sanity-draft-errors.md");

const pushError = (doc, message, path = "") => {
  errors.push({
    id: doc._id,
    type: doc._type,
    slug: doc.slug?.current ?? null,
    title: doc.title ?? null,
    path,
    message,
  });
};

const validateCustomUrl = (doc, value, path) => {
  if (!isObject(value)) {
    pushError(doc, "Expected customUrl object", path);
    return;
  }
  const { type, external, internal, openInNewTab } = value;
  if (type !== "internal" && type !== "external") {
    pushError(doc, "customUrl.type must be internal or external", `${path}.type`);
  }
  if (type === "external") {
    if (!isString(external)) {
      pushError(doc, "customUrl.external must be a string URL", `${path}.external`);
    }
  }
  if (type === "internal") {
    if (!isObject(internal) || !isString(internal._ref)) {
      pushError(doc, "customUrl.internal must be a reference", `${path}.internal`);
    }
  }
  if (!isBoolean(openInNewTab)) {
    pushError(doc, "customUrl.openInNewTab must be boolean", `${path}.openInNewTab`);
  }
};

const validateButtons = (doc, buttons, path) => {
  if (!Array.isArray(buttons)) return;
  buttons.forEach((button, index) => {
    if (!isObject(button)) {
      pushError(doc, "button must be an object", `${path}[${index}]`);
      return;
    }
    if (button.url) {
      validateCustomUrl(doc, button.url, `${path}[${index}].url`);
    }
  });
};

const validateWodifySchedule = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "wodifySchedule.title is required", `${path}.title`);
  }
  if (block.daysToShow !== undefined && !isNumber(block.daysToShow)) {
    pushError(doc, "wodifySchedule.daysToShow must be a number", `${path}.daysToShow`);
  }
  ["showAvailability", "groupByDay", "showCoach"].forEach((field) => {
    if (block[field] !== undefined && !isBoolean(block[field])) {
      pushError(doc, `wodifySchedule.${field} must be boolean`, `${path}.${field}`);
    }
  });
  if (block.programs && !Array.isArray(block.programs)) {
    pushError(doc, "wodifySchedule.programs must be an array", `${path}.programs`);
  }
};

const validateWodifyWod = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "wodifyWod.title is required", `${path}.title`);
  }
  if (!isString(block.programId)) {
    pushError(doc, "wodifyWod.programId is required", `${path}.programId`);
  }
  if (block.daysAhead !== undefined && !isNumber(block.daysAhead)) {
    pushError(doc, "wodifyWod.daysAhead must be a number", `${path}.daysAhead`);
  }
  if (block.showPublicNotes !== undefined && !isBoolean(block.showPublicNotes)) {
    pushError(doc, "wodifyWod.showPublicNotes must be boolean", `${path}.showPublicNotes`);
  }
};

const validateFaqAccordion = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "faqAccordion.title is required", `${path}.title`);
  }
  if (!Array.isArray(block.faqs) || block.faqs.length === 0) {
    pushError(doc, "faqAccordion.faqs must be a non-empty array", `${path}.faqs`);
  } else {
    block.faqs.forEach((faq, index) => {
      if (!isObject(faq) || !isString(faq._ref)) {
        pushError(doc, "faqAccordion.faqs must be references", `${path}.faqs[${index}]`);
      }
    });
  }
  if (block.link?.url) {
    validateCustomUrl(doc, block.link.url, `${path}.link.url`);
  }
};

const validateImageLinkCards = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "imageLinkCards.title is required", `${path}.title`);
  }
  if (block.buttons) validateButtons(doc, block.buttons, `${path}.buttons`);
  if (!Array.isArray(block.cards)) return;
  block.cards.forEach((card, index) => {
    if (!isObject(card)) {
      pushError(doc, "imageLinkCards.cards item must be object", `${path}.cards[${index}]`);
      return;
    }
    if (!isString(card.title)) {
      pushError(doc, "imageLinkCards.cards[].title required", `${path}.cards[${index}].title`);
    }
    if (!isString(card.description)) {
      pushError(doc, "imageLinkCards.cards[].description required", `${path}.cards[${index}].description`);
    }
    if (card.url) {
      validateCustomUrl(doc, card.url, `${path}.cards[${index}].url`);
    }
    if (card.buttons) validateButtons(doc, card.buttons, `${path}.cards[${index}].buttons`);
  });
};

const validateGoogleReviews = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "googleReviews.title is required", `${path}.title`);
  }
  if (!isNumber(block.reviewsNumber)) {
    pushError(doc, "googleReviews.reviewsNumber must be number", `${path}.reviewsNumber`);
  }
  if (!isString(block.layout)) {
    pushError(doc, "googleReviews.layout is required", `${path}.layout`);
  }
  [
    "showDots",
    "autoplay",
    "accessibility",
    "hideEmptyReviews",
    "structuredData",
  ].forEach((field) => {
    if (block[field] !== undefined && !isBoolean(block[field])) {
      pushError(doc, `googleReviews.${field} must be boolean`, `${path}.${field}`);
    }
  });
  ["autoplaySpeed", "maxCharacters"].forEach((field) => {
    if (block[field] !== undefined && !isNumber(block[field])) {
      pushError(doc, `googleReviews.${field} must be number`, `${path}.${field}`);
    }
  });
};

const validateWodifyCoaches = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "wodifyCoaches.title is required", `${path}.title`);
  }
  if (block.itemsPerRow !== undefined && !isNumber(block.itemsPerRow)) {
    pushError(doc, "wodifyCoaches.itemsPerRow must be number", `${path}.itemsPerRow`);
  }
  if (block.showLinks !== undefined && !isBoolean(block.showLinks)) {
    pushError(doc, "wodifyCoaches.showLinks must be boolean", `${path}.showLinks`);
  }
};

const validateContactUs = (doc, block, path) => {
  if (!isString(block.title)) {
    pushError(doc, "contactUs.title is required", `${path}.title`);
  }
  if (block.showMap !== undefined && !isBoolean(block.showMap)) {
    pushError(doc, "contactUs.showMap must be boolean", `${path}.showMap`);
  }
  if (block.hours) {
    if (!Array.isArray(block.hours)) {
      pushError(doc, "contactUs.hours must be array", `${path}.hours`);
    } else {
      block.hours.forEach((hour, index) => {
        if (!isObject(hour) || !isString(hour.day)) {
          pushError(doc, "contactUs.hours[].day required", `${path}.hours[${index}].day`);
        }
        if (hour.closed !== undefined && !isBoolean(hour.closed)) {
          pushError(doc, "contactUs.hours[].closed must be boolean", `${path}.hours[${index}].closed`);
        }
      });
    }
  }
};

const validateBlock = (doc, block, index) => {
  if (!isObject(block)) {
    pushError(doc, "pageBuilder item must be object", `pageBuilder[${index}]`);
    return;
  }
  if (!isString(block._type)) {
    pushError(doc, "pageBuilder item missing _type", `pageBuilder[${index}]`);
    return;
  }
  const path = `pageBuilder[${index}]`;
  switch (block._type) {
    case "wodifySchedule":
      validateWodifySchedule(doc, block, path);
      break;
    case "wodifyWod":
      validateWodifyWod(doc, block, path);
      break;
    case "faqAccordion":
      validateFaqAccordion(doc, block, path);
      break;
    case "imageLinkCards":
      validateImageLinkCards(doc, block, path);
      break;
    case "googleReviews":
      validateGoogleReviews(doc, block, path);
      break;
    case "wodifyCoaches":
      validateWodifyCoaches(doc, block, path);
      break;
    case "contactUs":
      validateContactUs(doc, block, path);
      break;
    case "hero":
    case "layout":
    case "cta":
    case "logos":
    case "featureCardsIcon":
    case "subscribeNewsletter":
      if (block.buttons) validateButtons(doc, block.buttons, `${path}.buttons`);
      break;
    default:
      break;
  }
};

const validateDoc = (doc) => {
  if (doc._type === "page" || doc._type === "homePage") {
    if (!isObject(doc.slug) || !isString(doc.slug.current)) {
      pushError(doc, "slug.current is required", "slug.current");
    }
    if (doc._type === "page" && !isString(doc.title)) {
      pushError(doc, "page.title is required", "title");
    }
    if (!Array.isArray(doc.pageBuilder)) {
      pushError(doc, "pageBuilder must be array", "pageBuilder");
    } else {
      doc.pageBuilder.forEach((block, index) => validateBlock(doc, block, index));
    }
  }
};

const main = async () => {
  const docs = await client.fetch(
    `*[_id match "drafts.*" && _type in ["page", "homePage"]]{_id,_type,title,slug,pageBuilder}`,
  );

  docs.forEach(validateDoc);

  if (errors.length === 0) {
    fs.writeFileSync(reportJsonPath, JSON.stringify({ errors: [] }, null, 2));
    fs.writeFileSync(
      reportMdPath,
      "# Sanity Draft Errors\n\nNo draft validation errors found.\n",
    );
    console.log(`No draft validation errors found. Report written to ${reportMdPath}`);
    return;
  }

  const markdownLines = [
    "# Sanity Draft Errors",
    "",
    `Found ${errors.length} draft validation error(s).`,
    "",
  ];

  errors.forEach((err) => {
    const heading = `- ${err.id} (${err.type}) ${err.slug ?? ""} ${err.title ?? ""}`.trim();
    markdownLines.push(heading);
    markdownLines.push(`  - ${err.path}: ${err.message}`);
  });

  fs.writeFileSync(reportJsonPath, JSON.stringify({ errors }, null, 2));
  fs.writeFileSync(reportMdPath, `${markdownLines.join("\n")}\n`);

  console.log(`Found ${errors.length} draft validation error(s).`);
  console.log(`Report written to ${reportMdPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
