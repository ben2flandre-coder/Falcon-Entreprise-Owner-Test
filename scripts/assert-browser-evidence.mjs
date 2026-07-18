import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "evidence");
const sourceCommit = "d21cff4b42afa05e68883462862fbdcd138f1189";
const licenseId = "falcon-ei16-owner-test-d21cff4b";

const expectations = [
  {
    name: "desktop-preactivation",
    file: "desktop-preactivation-probe-dom.html",
    attributes: {
      "data-falcon-probe-ready": "true",
      "data-falcon-probe-phase": "preactivation",
      "data-falcon-mode": "production",
      "data-falcon-runtime-empty": "true",
      "data-falcon-license-tier": "trial",
      "data-falcon-license-id": "falcon-local-trial",
      "data-falcon-license-allowed": "true",
      "data-falcon-capability-count": "3",
      "data-falcon-application-profile": "Consultant Senior"
    }
  },
  {
    name: "desktop-activation",
    file: "desktop-activation-dom.html",
    attributes: {
      "data-falcon-activation-ready": "true",
      "data-falcon-activation-verified": "true",
      "data-falcon-license-before": "trial",
      "data-falcon-license-after": "enterprise",
      "data-falcon-license-id": licenseId,
      "data-falcon-capability-count": "7",
      "data-falcon-application-profile": "Administrateur",
      "data-falcon-mode": "production",
      "data-falcon-runtime-empty": "true",
      "data-falcon-source-commit": sourceCommit
    }
  },
  {
    name: "desktop-postactivation",
    file: "desktop-postactivation-probe-dom.html",
    attributes: {
      "data-falcon-probe-ready": "true",
      "data-falcon-probe-phase": "postactivation",
      "data-falcon-mode": "production",
      "data-falcon-runtime-empty": "true",
      "data-falcon-license-tier": "enterprise",
      "data-falcon-license-id": licenseId,
      "data-falcon-license-allowed": "true",
      "data-falcon-capability-count": "7",
      "data-falcon-application-profile": "Administrateur"
    }
  },
  {
    name: "mobile-preactivation",
    file: "mobile-preactivation-probe-dom.html",
    attributes: {
      "data-falcon-probe-ready": "true",
      "data-falcon-probe-phase": "preactivation",
      "data-falcon-mode": "production",
      "data-falcon-runtime-empty": "true",
      "data-falcon-license-tier": "trial",
      "data-falcon-license-id": "falcon-local-trial",
      "data-falcon-license-allowed": "true",
      "data-falcon-capability-count": "3",
      "data-falcon-application-profile": "Consultant Senior"
    }
  },
  {
    name: "mobile-activation",
    file: "mobile-activation-dom.html",
    attributes: {
      "data-falcon-activation-ready": "true",
      "data-falcon-activation-verified": "true",
      "data-falcon-license-before": "trial",
      "data-falcon-license-after": "enterprise",
      "data-falcon-license-id": licenseId,
      "data-falcon-capability-count": "7",
      "data-falcon-application-profile": "Administrateur",
      "data-falcon-mode": "production",
      "data-falcon-runtime-empty": "true",
      "data-falcon-source-commit": sourceCommit
    }
  },
  {
    name: "mobile-postactivation",
    file: "mobile-postactivation-probe-dom.html",
    attributes: {
      "data-falcon-probe-ready": "true",
      "data-falcon-probe-phase": "postactivation",
      "data-falcon-mode": "production",
      "data-falcon-runtime-empty": "true",
      "data-falcon-license-tier": "enterprise",
      "data-falcon-license-id": licenseId,
      "data-falcon-license-allowed": "true",
      "data-falcon-capability-count": "7",
      "data-falcon-application-profile": "Administrateur"
    }
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readHtmlAttributes(relative) {
  const absolute = path.join(evidenceRoot, relative);
  const text = fs.readFileSync(absolute, "utf8");
  const html = text.match(/<html\b[^>]*>/i)?.[0];
  if (!html) throw new Error(`Missing html element in ${relative}.`);
  return Object.fromEntries([...html.matchAll(/\b(data-falcon-[a-z0-9-]+)="([^"]*)"/gi)].map((match) => [match[1], match[2]]));
}

const checks = [];
const issues = [];
for (const expectation of expectations) {
  const observed = readHtmlAttributes(expectation.file);
  for (const [attribute, expected] of Object.entries(expectation.attributes)) {
    const actual = observed[attribute] ?? null;
    const passed = actual === expected;
    const record = { phase: expectation.name, attribute, expected, actual, passed };
    checks.push(record);
    if (!passed) issues.push(record);
  }
  const html = fs.readFileSync(path.join(evidenceRoot, expectation.file), "utf8");
  const forbidden = ["humanWorkflowPass\": true", "cryptographicLicenseProof\": true"];
  for (const token of forbidden) {
    const passed = !new RegExp(escapeRegExp(token)).test(html);
    const record = { phase: expectation.name, claim: `forbid:${token}`, passed };
    checks.push(record);
    if (!passed) issues.push(record);
  }
}

const renderedHtml = {};
for (const [viewport, file] of [["desktop", "desktop-dom.html"], ["mobile", "mobile-dom.html"]]) {
  const html = fs.readFileSync(path.join(evidenceRoot, file), "utf8");
  renderedHtml[viewport] = html;
  for (const [code, pattern] of [
    ["ENTERPRISE_RUNTIME_READY", /data-falcon-enterprise-runtime="ready"/],
    ["FALCON_UI_PRESENT", /Falcon Enterprise/]
  ]) {
    const passed = pattern.test(html);
    const record = { phase: `${viewport}-render`, claim: code, passed };
    checks.push(record);
    if (!passed) issues.push(record);
  }
}

const uiObservations = [
  { code: "SHOWCASE_PRODUCT_IDENTITY_PRESENT", pattern: /Showcase Edition S1\+/ },
  { code: "SHOWCASE_VISIBLE_VERSION_PRESENT", pattern: /V46\.5\.0-SHOWCASE-V1\.0/ },
  { code: "DEMONSTRATION_ACTION_PRESENT", pattern: /Charger démo avancée/ },
  { code: "SAMPLE_MISSION_FALLBACK_PRESENT", pattern: /Usine Alpha — Audit sécurité opérationnelle/ }
].map(({ code, pattern }) => ({
  code,
  desktop: pattern.test(renderedHtml.desktop),
  mobile: pattern.test(renderedHtml.mobile)
}));
const knownUiMismatches = uiObservations.filter((observation) => observation.desktop || observation.mobile).map((observation) => observation.code);
const uiProductIdentityPass = !knownUiMismatches.some((code) => new Set(["SHOWCASE_PRODUCT_IDENTITY_PRESENT", "SHOWCASE_VISIBLE_VERSION_PRESENT"]).has(code));
const visualBlankStatePass = !knownUiMismatches.some((code) => new Set(["DEMONSTRATION_ACTION_PRESENT", "SAMPLE_MISSION_FALLBACK_PRESENT"]).has(code));

const ready = issues.length === 0;
const report = {
  schema: "falcon.owner-test.browser-qualification.v2",
  sourceCommit,
  status: ready ? "technically-qualified-for-controlled-human-test" : "blocked",
  ready,
  readyForControlledHumanTest: ready,
  facts: {
    isolatedBrowserProfiles: 2,
    preactivationTier: "trial",
    postactivationTier: "enterprise",
    enterpriseCapabilityCount: 7,
    applicationProfile: "Administrateur",
    runtimeMode: "production",
    runtimeEmpty: true,
    uiProductIdentityPass,
    visualBlankStatePass,
    humanWorkflowPass: false,
    cryptographicLicenseProof: false
  },
  knownUiMismatches,
  uiObservations,
  checks,
  issues
};

fs.writeFileSync(path.join(evidenceRoot, "browser-qualification.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!ready) process.exitCode = 1;
