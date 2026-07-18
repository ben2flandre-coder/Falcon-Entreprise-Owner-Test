import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = path.join(root, "candidate");
const contract = JSON.parse(fs.readFileSync(path.join(root, "deployment-contract.json"), "utf8"));
const checks = [];
const issues = [];

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function check(code, passed, detail) {
  const record = { code, passed: Boolean(passed), detail };
  checks.push(record);
  if (!record.passed) issues.push(record);
}

check("CONTRACT_SCHEMA", contract.schema === "falcon.owner-test.pages-deployment.v1", "Deployment contract schema is supported.");
check("SOURCE_COMMIT", /^[0-9a-f]{40}$/.test(contract.source?.commit || ""), "Source is bound to a full Git commit.");
check("PRODUCTION_PROFILE", contract.source?.environmentProfile === "production" && contract.source?.demoMode === false, "Candidate is production-profile and demo-disabled.");
check("NO_PUBLIC_RELEASE", contract.publication?.publicRelease === false && contract.publication?.commercialRelease === false, "Deployment is not a public or commercial release.");
check("NO_REAL_DATA", contract.publication?.realDataAllowed === false, "Real data is forbidden.");
check("NO_EXTERNAL_AI", contract.publication?.externalAiAllowed === false, "External AI is forbidden during owner tests.");
check("UNPUBLISH_REQUIRED", contract.publication?.unpublishAfterOwnerTests === true, "Test site must be unpublished after qualification.");

const records = [...contract.exactRuntimeFiles, ...contract.deploymentHarnessFiles];
const declaredPaths = records.map((record) => record.path).sort();
check("DECLARED_PATHS_UNIQUE", new Set(declaredPaths).size === declaredPaths.length, "All deployed paths are unique.");
check("CANDIDATE_DIGEST", contract.candidateSha256 === sha256(JSON.stringify(records)), "Canonical candidate digest matches the deployment contract.");

for (const record of records) {
  const absolute = path.join(candidateRoot, record.path);
  const present = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  check(`FILE_PRESENT:${record.path}`, present, `${record.path} is present.`);
  if (!present) continue;
  const bytes = fs.readFileSync(absolute);
  check(`FILE_SIZE:${record.path}`, bytes.length === record.size, `${record.path} size matches.`);
  check(`FILE_SHA256:${record.path}`, sha256(bytes) === record.sha256, `${record.path} digest matches.`);
}

const observed = [];
function walk(directory) {
  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    if (fs.statSync(absolute).isDirectory()) walk(absolute);
    else observed.push(path.relative(candidateRoot, absolute).replaceAll("\\", "/"));
  }
}
walk(candidateRoot);
check("NO_UNDECLARED_FILES", JSON.stringify(observed.sort()) === JSON.stringify(declaredPaths), "No undeclared file is deployed.");

const forbiddenPathPatterns = [
  /(^|\/)\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)configuration\//i,
  /(^|\/)internal-owner-license(?:\.|$)/i,
  /(^|\/)owner-test-kit\//i,
  /(^|\/)qualification\.json$/i
];
const forbiddenPaths = observed.filter((relative) => forbiddenPathPatterns.some((pattern) => pattern.test(relative)));
check("NO_PRIVATE_PACKAGE_FILES", forbiddenPaths.length === 0, forbiddenPaths.length ? `Forbidden paths: ${forbiddenPaths.join(", ")}` : "No private package, license, configuration or internal evidence file is deployed.");

const credentialPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/
];
const credentialHits = [];
for (const relative of observed) {
  const text = fs.readFileSync(path.join(candidateRoot, relative), "utf8");
  if (credentialPatterns.some((pattern) => pattern.test(text))) credentialHits.push(relative);
}
check("NO_EMBEDDED_CREDENTIALS", credentialHits.length === 0, credentialHits.length ? `Credential-like content: ${credentialHits.join(", ")}` : "No embedded credential signature is present.");

const index = fs.readFileSync(path.join(candidateRoot, "index.html"), "utf8");
check("CANONICAL_ENTRYPOINT", index.includes('src="src/app/showcase-enterprise-bootstrap.js"'), "Canonical Enterprise bootstrap is loaded.");
check("RESPONSIVE_VIEWPORT", /name=["']viewport["']/.test(index), "Mobile viewport is declared.");

const ready = issues.length === 0;
const report = {
  schema: "falcon.owner-test.pages-qualification.v1",
  sourceCommit: contract.source.commit,
  applicationVersion: contract.source.applicationVersion,
  status: ready ? "qualified" : "blocked",
  ready,
  facts: {
    exactRuntimeFileCount: contract.exactRuntimeFiles.length,
    deploymentHarnessFileCount: contract.deploymentHarnessFiles.length,
    deployedFileCount: observed.length,
    realDataAllowed: contract.publication.realDataAllowed,
    publicRelease: contract.publication.publicRelease
  },
  checks,
  issues
};

fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
fs.writeFileSync(path.join(root, "evidence", "qualification.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!ready) process.exitCode = 1;
