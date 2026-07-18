import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_SOURCE_COMMIT = "d21cff4b42afa05e68883462862fbdcd138f1189";
const EXPECTED_VERSION = "48.0.0-rc.1";
const EXPECTED_MANIFEST_SHA256 = "4dd85bab801f90c44d3c2f8e377e196a6be575d593abd9ac1e7afcf6104c060c";

const sourceRoot = path.resolve(process.argv[2] || "");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = path.join(repositoryRoot, "candidate");
const contractPath = path.join(repositoryRoot, "deployment-contract.json");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeRelative(relative) {
  const normalized = path.posix.normalize(String(relative).replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe candidate path: ${relative}`);
  }
  return normalized;
}

function readSource(relative) {
  const safe = normalizeRelative(relative);
  const absolute = path.join(sourceRoot, safe);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`Required source file is missing: ${safe}`);
  }
  return fs.readFileSync(absolute);
}

if (!sourceRoot || !fs.existsSync(sourceRoot)) {
  throw new Error("Usage: node scripts/prepare-candidate.mjs /absolute/path/to/qualified/application");
}
if (fs.existsSync(candidateRoot) || fs.existsSync(contractPath)) {
  throw new Error("Candidate or deployment contract already exists; preparation is intentionally non-destructive.");
}

const sourceManifestText = readSource("release-manifest.json");
const sourceManifest = JSON.parse(sourceManifestText.toString("utf8"));
if (sha256(sourceManifestText) !== EXPECTED_MANIFEST_SHA256) throw new Error("Unexpected source release manifest digest.");
if (sourceManifest.sourceCommit !== EXPECTED_SOURCE_COMMIT) throw new Error("Unexpected source commit.");
if (sourceManifest.version !== EXPECTED_VERSION) throw new Error("Unexpected application version.");
if (sourceManifest.environmentProfile !== "production" || sourceManifest.demoMode !== false) {
  throw new Error("Only the production, demo-disabled candidate may be prepared.");
}

const sourceRecords = new Map(sourceManifest.files.map((record) => [record.path, record]));
const exactFiles = new Set(["index.html"]);
const queue = [];

const indexText = readSource("index.html").toString("utf8");
for (const match of indexText.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
  const reference = match[1];
  if (/^(?:data:|https?:|mailto:|#)/i.test(reference)) continue;
  const relative = normalizeRelative(reference.replace(/^\.\//, ""));
  exactFiles.add(relative);
  if (relative.endsWith(".js")) queue.push(relative);
}

while (queue.length) {
  const importer = queue.shift();
  const importerText = readSource(importer).toString("utf8");
  const importPattern = /(?:^|\n)\s*import(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g;
  for (const match of importerText.matchAll(importPattern)) {
    const reference = match[1];
    if (!reference.startsWith(".")) throw new Error(`Non-relative browser import in ${importer}: ${reference}`);
    const dependency = normalizeRelative(path.posix.join(path.posix.dirname(importer), reference));
    if (!exactFiles.has(dependency)) {
      exactFiles.add(dependency);
      queue.push(dependency);
    }
  }
}

const exactRecords = [...exactFiles].sort().map((relative) => {
  const bytes = readSource(relative);
  const sourceRecord = sourceRecords.get(relative);
  if (!sourceRecord) throw new Error(`Runtime file is not declared by the qualified application: ${relative}`);
  if (bytes.length !== sourceRecord.size || sha256(bytes) !== sourceRecord.sha256) {
    throw new Error(`Runtime file differs from the qualified application: ${relative}`);
  }
  const destination = path.join(candidateRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, relative), destination);
  return Object.freeze({ path: relative, size: bytes.length, sha256: sha256(bytes) });
});

const harnessContents = new Map([
  [".nojekyll", ""],
  ["probe.html", fs.readFileSync(path.join(repositoryRoot, "harness", "probe.html"), "utf8")],
  ["robots.txt", "User-agent: *\nDisallow: /\n"],
  ["test-context.json", `${JSON.stringify({
    schema: "falcon.owner-test.context.v1",
    applicationVersion: EXPECTED_VERSION,
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    environmentProfile: "production",
    demoMode: false,
    publicRelease: false,
    realDataAllowed: false,
    storageScope: "per-browser-per-device",
    evidenceIssue: 230
  }, null, 2)}\n`]
]);

const harnessRecords = [...harnessContents].map(([relative, content]) => {
  const bytes = Buffer.from(content, "utf8");
  fs.writeFileSync(path.join(candidateRoot, relative), bytes);
  return Object.freeze({ path: relative, size: bytes.length, sha256: sha256(bytes) });
});
const sortedHarnessRecords = harnessRecords.sort((a, b) => a.path.localeCompare(b.path));
const candidateSha256 = sha256(JSON.stringify([...exactRecords, ...sortedHarnessRecords]));

const contract = {
  schema: "falcon.owner-test.pages-deployment.v1",
  repository: "ben2flandre-coder/Falcon-Entreprise-Owner-Test",
  purpose: "Temporary owner-only field qualification from PC and mobile browsers.",
  source: {
    repository: "ben2flandre-coder/Falcon-Entreprise",
    commit: EXPECTED_SOURCE_COMMIT,
    applicationVersion: EXPECTED_VERSION,
    releaseManifestSha256: EXPECTED_MANIFEST_SHA256,
    environmentProfile: "production",
    demoMode: false
  },
  publication: {
    publicRelease: false,
    commercialRelease: false,
    temporaryPublicTestSite: true,
    realDataAllowed: false,
    externalAiAllowed: false,
    unpublishAfterOwnerTests: true
  },
  evidence: {
    campaignIssue: 196,
    phaseIssue: 230,
    sourcePullRequest: 232,
    sourceArtifact: 8433983119,
    sourceWorkflowRun: 29659852254
  },
  candidateSha256,
  exactRuntimeFiles: exactRecords,
  deploymentHarnessFiles: sortedHarnessRecords
};

fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  schema: "falcon.owner-test.prepare-result.v1",
  sourceCommit: EXPECTED_SOURCE_COMMIT,
  version: EXPECTED_VERSION,
  exactRuntimeFileCount: exactRecords.length,
  harnessFileCount: harnessRecords.length,
  candidateSha256,
  candidateRoot
}, null, 2)}\n`);
