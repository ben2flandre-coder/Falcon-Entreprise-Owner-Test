import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = path.join(root, "candidate");
const contract = JSON.parse(fs.readFileSync(path.join(root, "deployment-contract.json"), "utf8"));
const checks = [];
const issues = [];
const EXPECTED_SOURCE_COMMIT = "d21cff4b42afa05e68883462862fbdcd138f1189";
const EXPECTED_EXACT_RUNTIME_DIGEST = "0a3c409f299a59be669986107f7479282b25a6afce20fc1092d58b2b1e7624c7";
const EXPECTED_CAPABILITIES = ["observe", "analyse", "arbitrate", "report", "export", "admin", "audit"];
const EXPECTED_HARNESS_PATHS = [".nojekyll", "activate.html", "owner-test-activation.json", "probe.html", "robots.txt", "test-context.json"];

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function check(code, passed, detail) {
  const record = { code, passed: Boolean(passed), detail };
  checks.push(record);
  if (!record.passed) issues.push(record);
}

check("CONTRACT_SCHEMA", contract.schema === "falcon.owner-test.pages-deployment.v1", "Deployment contract schema is supported.");
check("SOURCE_COMMIT", contract.source?.commit === EXPECTED_SOURCE_COMMIT, "Source is bound to the qualified full Git commit.");
check("PRODUCTION_PROFILE", contract.source?.environmentProfile === "production" && contract.source?.demoMode === false, "Candidate is production-profile and demo-disabled.");
check("NO_PUBLIC_RELEASE", contract.publication?.publicRelease === false && contract.publication?.commercialRelease === false, "Deployment is not a public or commercial release.");
check("NO_REAL_DATA", contract.publication?.realDataAllowed === false, "Real data is forbidden.");
check("NO_EXTERNAL_AI", contract.publication?.externalAiAllowed === false, "External AI is forbidden during owner tests.");
check("UNPUBLISH_REQUIRED", contract.publication?.unpublishAfterOwnerTests === true, "Test site must be unpublished after qualification.");
check("EXACT_RUNTIME_COUNT", contract.exactRuntimeFiles?.length === 21, "The exact qualified runtime closure contains 21 files.");
check("EXACT_RUNTIME_DIGEST", sha256(JSON.stringify(contract.exactRuntimeFiles)) === EXPECTED_EXACT_RUNTIME_DIGEST, "The exact runtime manifest is independently pinned.");
check("HARNESS_ALLOWLIST", JSON.stringify(contract.deploymentHarnessFiles?.map((record) => record.path)) === JSON.stringify(EXPECTED_HARNESS_PATHS), "Only the six approved deployment harness files are declared.");

const activation = JSON.parse(fs.readFileSync(path.join(candidateRoot, "owner-test-activation.json"), "utf8"));
check("ACTIVATION_SCHEMA", activation.schema === "falcon.owner-test.browser-activation.v1", "Browser activation schema is supported.");
check("ACTIVATION_SOURCE", activation.sourceCommit === EXPECTED_SOURCE_COMMIT, "Browser activation is bound to the qualified source commit.");
check("ACTIVATION_NON_COMMERCIAL", activation.commercialRelease === false && activation.containsSecret === false, "Browser activation is non-commercial and contains no secret.");
check("ACTIVATION_STORAGE_SCOPE", activation.storageScope === "per-browser-per-device", "Activation storage is isolated per browser and device.");
check("ACTIVATION_ENTERPRISE_TIER", activation.license?.tier === "enterprise" && activation.license?.status === "active", "The explicit owner-test tier is Enterprise and active.");
check("ACTIVATION_PROFILE", activation.applicationProfile === "Administrateur" && activation.license?.userProfile === activation.applicationProfile, "Application and entitlement test profiles are aligned.");
check("ACTIVATION_CAPABILITIES", JSON.stringify(activation.expectedCapabilities) === JSON.stringify(EXPECTED_CAPABILITIES), "All seven Enterprise entitlement capabilities are required.");
check("ACTIVATION_CONTRACT_LINK", contract.testActivation?.path === "owner-test-activation.json" && contract.testActivation?.licenseId === activation.license?.licenseId && contract.testActivation?.tier === activation.license?.tier, "Deployment contract identifies the exact test activation.");
check("NO_FALSE_HUMAN_PASS", contract.testActivation?.humanWorkflowPass === false && activation.limitations?.some((item) => item.includes("human PC and mobile")), "Automation cannot claim a human workflow PASS.");
check("NO_CRYPTOGRAPHIC_LICENSE_CLAIM", contract.testActivation?.cryptographicLicenseProof === false && activation.limitations?.some((item) => item.includes("not cryptographic licensing")), "Local activation is not represented as cryptographic licensing.");

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

const activationPage = fs.readFileSync(path.join(candidateRoot, "activate.html"), "utf8");
check("ACTIVATION_USES_OFFICIAL_LICENSE_API", activationPage.includes("api.commercial.saveLicense(contract.license)"), "Test activation uses the candidate commercial API.");
check("ACTIVATION_USES_OFFICIAL_PROFILE_API", activationPage.includes("security.switchProfile(contract.applicationProfile)"), "Test activation uses the candidate security profile API.");
check("ACTIVATION_RELOADS_RUNTIME", activationPage.includes("frame.src = `./index.html?owner-test-reload=${Date.now()}`"), "Activation is rechecked after a fresh runtime navigation.");
check("ACTIVATION_DOES_NOT_WRITE_STORAGE_DIRECTLY", !activationPage.includes("localStorage.setItem"), "The harness does not bypass candidate APIs with a direct storage write.");

const probePage = fs.readFileSync(path.join(candidateRoot, "probe.html"), "utf8");
check("PROBE_DEFAULTS_TO_ENTERPRISE", probePage.includes('get("expected") || "enterprise"'), "An unqualified probe defaults to requiring Enterprise.");
check("PROBE_REJECTS_FALSE_HUMAN_PASS", probePage.includes("humanWorkflowPass: false") && probePage.includes("cryptographicLicenseProof: false"), "Browser evidence explicitly excludes human and cryptographic claims.");

const testContext = JSON.parse(fs.readFileSync(path.join(candidateRoot, "test-context.json"), "utf8"));
check("TEST_CONTEXT_ACTIVATION", testContext.activationEntrypoint === "activate.html" && testContext.defaultLicenseTier === "trial" && testContext.requiredTestLicenseTier === "enterprise", "Served context exposes the explicit trial-to-Enterprise test path.");
check("TEST_CONTEXT_NO_HUMAN_PASS", testContext.humanWorkflowPass === false, "Served context cannot claim completed human tests.");

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
    activationEntrypoint: testContext.activationEntrypoint,
    defaultLicenseTier: testContext.defaultLicenseTier,
    requiredTestLicenseTier: testContext.requiredTestLicenseTier,
    enterpriseCapabilityCount: activation.expectedCapabilities.length,
    humanWorkflowPass: false,
    cryptographicLicenseProof: false,
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
