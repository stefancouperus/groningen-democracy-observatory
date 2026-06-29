import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(scriptDir, "..");
const site = path.join(project, "_site");

if (!fs.existsSync(site)) throw new Error("Rendered dashboard site not found. Run `quarto render` first.");

const forbiddenPathParts = ["/instructor/", "/raw/", "case_mapping", "regime_diagnostic", "transformation_log", "variable_key"];
const forbiddenText = ["country_real", "expected_endpoint", "expected_shape", "relevance_class", "evidence_role"];
const textExtensions = new Set([".html", ".json", ".js", ".css", ".xml", ".txt", ".csv", ".svg"]);
const files = [];

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(site);

const failures = [];
for (const file of files) {
  const relative = `/${path.relative(site, file).split(path.sep).join("/")}`;
  for (const part of forbiddenPathParts) {
    if (relative.includes(part)) failures.push(`${relative}: forbidden path token ${part}`);
  }
  if (textExtensions.has(path.extname(file).toLowerCase())) {
    const text = fs.readFileSync(file, "utf8");
    for (const token of forbiddenText) {
      if (text.includes(token)) failures.push(`${relative}: forbidden content token ${token}`);
    }
  }
}

const required = [
  "/index.html",
  "/entopia/index.html",
  "/moreland/index.html",
  "/govistan/index.html",
  "/data/variables.json",
  "/data/cases.json",
  "/assets/js/dashboard.js",
  "/assets/css/dashboard.css"
];
const relativeFiles = new Set(files.map((file) => `/${path.relative(site, file).split(path.sep).join("/")}`));
for (const file of required) {
  if (!relativeFiles.has(file)) failures.push(`${file}: required file missing`);
}

const wordingTargets = [
  "/assets/js/dashboard.js",
  "/data/cases.json",
  "/data/case_a.json",
  "/data/case_b.json",
  "/data/case_c.json",
  "/entopia/index.html",
  "/moreland/index.html",
  "/govistan/index.html"
];
for (const relative of wordingTargets) {
  const file = path.join(site, relative.slice(1));
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (/\b(?:synthetic|virtual)\b/i.test(text)) failures.push(`${relative}: obsolete public wording found`);
}

const landingText = fs.readFileSync(path.join(site, "index.html"), "utf8");
if (/\bvirtual\b/i.test(landingText)) failures.push("/index.html: obsolete public wording found");
const landingSyntheticUses = landingText.match(/\bsynthetic\b/gi) || [];
if (landingSyntheticUses.length !== 1) failures.push(`/index.html: expected one course-use disclaimer reference, found ${landingSyntheticUses.length}`);
if (!landingText.includes("Groningen Democracy Observatory")) failures.push("/index.html: Groningen Democracy Observatory branding missing");

if (failures.length) {
  throw new Error(`Public dashboard audit failed:\n${failures.join("\n")}`);
}

console.log(`Public dashboard audit passed for ${files.length} files.`);
