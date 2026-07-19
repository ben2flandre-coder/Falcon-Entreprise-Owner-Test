import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = path.join(root, "candidate");
const contractPath = path.join(root, "deployment-contract.json");
const pinPath = path.join(root, "qualification-pin.json");
const SOURCE_COMMIT = "2c3a0945650514a88fc7050187e6e6ea1c5f2775";
const SOURCE_PR = 234;

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function record(relativePath) {
  const bytes = fs.readFileSync(path.join(candidateRoot, relativePath));
  return { path: relativePath, size: bytes.length, sha256: sha256(bytes) };
}

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const runtimePaths = contract.exactRuntimeFiles.map((item) => item.path);
if (!runtimePaths.includes("src/app/owner-product-polish.js")) {
  runtimePaths.splice(runtimePaths.indexOf("src/app/showcase-enterprise-bootstrap.js") + 1, 0, "src/app/owner-product-polish.js");
}
const harnessPaths = contract.deploymentHarnessFiles.map((item) => item.path);

contract.source.commit = SOURCE_COMMIT;
contract.evidence.sourcePullRequest = SOURCE_PR;
contract.evidence.phaseIssue = 233;
contract.testActivation.licenseId = `falcon-ei16-owner-test-${SOURCE_COMMIT.slice(0, 8)}`;
contract.exactRuntimeFiles = runtimePaths.map(record);
contract.deploymentHarnessFiles = harnessPaths.map(record);
const allRecords = [...contract.exactRuntimeFiles, ...contract.deploymentHarnessFiles];
contract.candidateSha256 = sha256(JSON.stringify(allRecords));

const runtimeDigest = sha256(JSON.stringify(contract.exactRuntimeFiles));
const pin = {
  schema: "falcon.owner-test.qualification-pin.v1",
  sourceCommit: SOURCE_COMMIT,
  exactRuntimeFileCount: contract.exactRuntimeFiles.length,
  exactRuntimeDigest: runtimeDigest,
  generatedFromCandidate: true
};

fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
fs.writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);
console.log(JSON.stringify({ sourceCommit: SOURCE_COMMIT, runtimeFiles: contract.exactRuntimeFiles.length, runtimeDigest, candidateSha256: contract.candidateSha256 }, null, 2));
