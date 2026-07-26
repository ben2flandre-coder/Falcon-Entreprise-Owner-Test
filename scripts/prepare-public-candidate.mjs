import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANDIDATE = path.join(ROOT, "candidate");
const MANIFEST_PATH = path.join(CANDIDATE, "release-manifest.json");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

for (const record of manifest.files) {
  const bytes = fs.readFileSync(path.join(CANDIDATE, record.path));
  record.size = bytes.length;
  record.sha256 = sha256(bytes);
}

writeJson(MANIFEST_PATH, manifest);

const checksumLines = manifest.files.map((record) => `${record.sha256}  ${record.path}`);
fs.writeFileSync(path.join(CANDIDATE, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);

const packageSha256 = sha256(fs.readFileSync(MANIFEST_PATH));
fs.writeFileSync(path.join(CANDIDATE, "PACKAGE_SHA256"), `${packageSha256}\n`);

for (const relative of [
  "candidate/owner-test-activation.json",
  "candidate/qualification-pin.json",
  "qualification-pin.json"
]) {
  const filePath = path.join(ROOT, relative);
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  value.packageManifestSha256 = packageSha256;
  writeJson(filePath, value);
}

const readmePath = path.join(ROOT, "README.md");
const readme = fs.readFileSync(readmePath, "utf8").replace(
  /empreinte du paquet : `[a-f0-9]{64}`/,
  `empreinte du paquet : \`${packageSha256}\``
);
fs.writeFileSync(readmePath, readme);

const activationPagePath = path.join(CANDIDATE, "activate.html");
const activationPage = fs.readFileSync(activationPagePath, "utf8").replace(
  /Paquet : <code>[a-f0-9]{64}<\/code>/,
  `Paquet : <code>${packageSha256}</code>`
);
fs.writeFileSync(activationPagePath, activationPage);

process.stdout.write(`${JSON.stringify({
  sourceCommit: manifest.sourceCommit,
  applicationFileCount: manifest.files.length,
  packageSha256
}, null, 2)}\n`);
