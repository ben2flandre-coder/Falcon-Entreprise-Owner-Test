import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANDIDATE = path.join(ROOT, "candidate");
const EXPECTED_SOURCE = "1c2f1b8a17139041bfda218616a0951e23880913";
const EXPECTED_VERSION = "48.0.0-rc.1";
const EXPECTED_RUNTIME_VERSION = "V48.0.0-dev";
const EXPECTED_FILE_COUNT = 131;
const qualificationPin = JSON.parse(fs.readFileSync(path.join(ROOT, "qualification-pin.json"), "utf8"));
const EXPECTED_PACKAGE_SHA256 = qualificationPin.packageManifestSha256;

function read(relative) {
  return fs.readFileSync(path.join(CANDIDATE, relative));
}

function readJson(relative) {
  return JSON.parse(read(relative).toString("utf8"));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifestBytes = read("release-manifest.json");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const activation = readJson("owner-test-activation.json");
const runtimeVersion = read("src/modules/enterprise/enterprise-runtime.js").toString("utf8");
const checksums = read("SHA256SUMS").toString("utf8").trimEnd().split("\n");

assert(manifest.schema === "falcon.release.manifest.v2", "Unsupported release manifest.");
assert(manifest.inventorySchema === "falcon.release.inventory.v1", "Unsupported inventory schema.");
assert(manifest.product === "Falcon Enterprise", "Unexpected product.");
assert(manifest.version === EXPECTED_VERSION, "Unexpected application version.");
assert(manifest.sourceCommit === EXPECTED_SOURCE, "Release provenance mismatch.");
assert(manifest.environmentProfile === "production", "Candidate is not in production profile.");
assert(manifest.demoMode === false, "Implicit demonstration mode is enabled.");
assert(manifest.features?.externalAI === false, "External AI must remain disabled.");
assert(Array.isArray(manifest.files) && manifest.files.length === EXPECTED_FILE_COUNT, "Unexpected application inventory.");

const expectedChecksumLines = [];
for (const record of manifest.files) {
  assert(record.path && !path.isAbsolute(record.path) && !record.path.includes(".."), `Unsafe path: ${record.path}`);
  const bytes = read(record.path);
  assert(bytes.length === record.size, `Size mismatch: ${record.path}`);
  assert(sha256(bytes) === record.sha256, `Digest mismatch: ${record.path}`);
  expectedChecksumLines.push(`${record.sha256}  ${record.path}`);
}

assert(JSON.stringify(checksums) === JSON.stringify(expectedChecksumLines), "SHA256SUMS does not match the manifest.");
assert(read("PACKAGE_SHA256").toString("utf8").trim() === EXPECTED_PACKAGE_SHA256, "Unexpected package fingerprint.");
assert(sha256(manifestBytes) === EXPECTED_PACKAGE_SHA256, "PACKAGE_SHA256 does not match the manifest.");
assert(activation.schema === "falcon.owner-test.browser-activation.v3", "Unsupported activation contract.");
assert(activation.sourceCommit === EXPECTED_SOURCE, "Owner-test contract provenance mismatch.");
assert(activation.containsSecret === false && activation.commercialRelease === false, "Invalid activation scope.");
assert(activation.humanVerdict === "PENDING" && activation.humanReceptionRequired === true, "Human authority contract mismatch.");
assert(runtimeVersion.includes(`ENTERPRISE_RUNTIME_VERSION = "${EXPECTED_RUNTIME_VERSION}"`), "Runtime version mismatch.");
const activationPage = read("activate.html").toString("utf8");
assert(activationPage.includes(EXPECTED_SOURCE), "Activation page provenance mismatch.");
assert(activationPage.includes(EXPECTED_PACKAGE_SHA256), "Activation page package fingerprint mismatch.");

process.stdout.write(`${JSON.stringify({
  schema: "falcon.owner-test.qualification.v3",
  ready: true,
  sourceCommit: EXPECTED_SOURCE,
  applicationVersion: EXPECTED_VERSION,
  applicationFileCount: manifest.files.length,
  packageSha256: EXPECTED_PACKAGE_SHA256,
  browserScenarios: activation.expectedScenarios.length,
  productionProfile: true,
  demoMode: false,
  externalAI: false,
  realDataAllowed: false,
  humanVerdict: activation.humanVerdict
}, null, 2)}\n`);
