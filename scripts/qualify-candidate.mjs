import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANDIDATE = path.join(ROOT, "candidate");
const EXPECTED_SOURCE = "7ceae8e235556665d7e70ab28eb5a45ec44d5257";
const EXPECTED_VERSION = "48.0.0-rc.1";
const EXPECTED_RUNTIME_VERSION = "V48.0.0-dev";

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
const context = readJson("test-context.json");
const runtimeVersion = read("src/modules/enterprise/enterprise-runtime.js").toString("utf8");
const checksums = read("SHA256SUMS").toString("utf8").trimEnd().split("\n");

assert(manifest.schema === "falcon.release.manifest.v2", "Unsupported release manifest.");
assert(manifest.inventorySchema === "falcon.release.inventory.v1", "Unsupported inventory schema.");
assert(manifest.product === "Falcon Enterprise", "Unexpected product.");
assert(manifest.version === EXPECTED_VERSION, "Unexpected application version.");
assert(manifest.sourceCommit === EXPECTED_SOURCE, "Release provenance mismatch.");
assert(manifest.environmentProfile === "production", "Candidate is not in production profile.");
assert(manifest.demoMode === false, "Implicit demonstration mode is enabled.");
assert(manifest.features?.externalAI === false, "External AI must remain disabled in the owner candidate.");
assert(Array.isArray(manifest.files) && manifest.files.length === 114, "Unexpected application inventory.");

const expectedChecksumLines = [];
for (const record of manifest.files) {
  assert(record.path && !path.isAbsolute(record.path) && !record.path.includes(".."), `Unsafe path: ${record.path}`);
  const bytes = read(record.path);
  assert(bytes.length === record.size, `Size mismatch: ${record.path}`);
  assert(sha256(bytes) === record.sha256, `Digest mismatch: ${record.path}`);
  expectedChecksumLines.push(`${record.sha256}  ${record.path}`);
}
assert(JSON.stringify(checksums) === JSON.stringify(expectedChecksumLines), "SHA256SUMS does not match the manifest.");
assert(read("PACKAGE_SHA256").toString("utf8").trim() === sha256(manifestBytes), "PACKAGE_SHA256 does not match the manifest.");

for (const record of [activation, context]) {
  assert(record.sourceCommit === EXPECTED_SOURCE, "Owner-test contract provenance mismatch.");
}
assert(activation.schema === "falcon.owner-test.browser-activation.v1", "Unsupported activation contract.");
assert(activation.containsSecret === false && activation.commercialRelease === false, "Invalid activation scope.");
assert(activation.license?.tier === "enterprise" && activation.license?.status === "active", "Invalid test entitlement.");
assert(context.applicationVersion === EXPECTED_VERSION, "Test context version mismatch.");
assert(context.environmentProfile === "production" && context.demoMode === false, "Invalid test context.");
assert(runtimeVersion.includes(`ENTERPRISE_RUNTIME_VERSION = "${EXPECTED_RUNTIME_VERSION}"`), "Runtime version mismatch.");
assert(read("activate.html").toString("utf8").includes(EXPECTED_SOURCE), "Activation page provenance mismatch.");

process.stdout.write(`${JSON.stringify({
  schema: "falcon.owner-test.qualification.v2",
  ready: true,
  sourceCommit: EXPECTED_SOURCE,
  applicationVersion: EXPECTED_VERSION,
  applicationFileCount: manifest.files.length,
  packageSha256: sha256(manifestBytes),
  productionProfile: true,
  demoMode: false,
  externalAI: false,
  realDataAllowed: false
}, null, 2)}\n`);
