export const MEDIA_DESTINATION_SCHEMA = "falcon.media.envelope.v1";
export const MEDIA_DESTINATION_VERSION = "1.0.0";

export const MEDIA_DESTINATIONS = Object.freeze({
  FALCON_ONLY: "falcon-only",
  GALLERY_ONLY: "gallery-only",
  FALCON_AND_GALLERY: "falcon-and-gallery"
});

const DESTINATIONS = Object.freeze(Object.values(MEDIA_DESTINATIONS));

export class MediaDestinationError extends Error {
  constructor(message, code = "MEDIA_DESTINATION_ERROR") {
    super(message);
    this.name = "MediaDestinationError";
    this.code = code;
  }
}

function text(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new MediaDestinationError(`${label} est obligatoire.`, "INVALID_MEDIA");
  return normalized;
}

function pathSegment(value, fallback = "media") {
  return String(value || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || fallback;
}

export function normalizeMediaDestination(value) {
  const normalized = String(value || "");
  if (!DESTINATIONS.includes(normalized)) {
    throw new MediaDestinationError("Destination média invalide.", "INVALID_DESTINATION");
  }
  return normalized;
}

export function inferMediaFolder(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "Photos";
  if (mime.startsWith("video/")) return "Vidéos";
  if (mime.startsWith("audio/")) return "Audio";
  return "Autres";
}

export async function sha256Bytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!globalThis.crypto?.subtle) throw new MediaDestinationError("Calcul d’intégrité indisponible.", "DIGEST_UNAVAILABLE");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createMediaEnvelope({
  bytes,
  fileName,
  mimeType,
  destination,
  missionId,
  observationId,
  context = "",
  now = () => new Date().toISOString(),
  idGenerator = null
} = {}) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const normalizedDestination = normalizeMediaDestination(destination);
  const createdAt = String(now());
  const digest = await sha256Bytes(payload);
  const id = text(
    idGenerator ? idGenerator() : `media-${createdAt.replace(/[^0-9]/g, "").slice(0, 17)}-${digest.slice(0, 8)}`,
    "Identifiant média"
  );
  const folder = inferMediaFolder(mimeType);
  const normalizedName = pathSegment(fileName);
  const localStored = normalizedDestination !== MEDIA_DESTINATIONS.GALLERY_ONLY;
  const galleryRequested = normalizedDestination !== MEDIA_DESTINATIONS.FALCON_ONLY;
  return Object.freeze({
    schema: MEDIA_DESTINATION_SCHEMA,
    version: MEDIA_DESTINATION_VERSION,
    id,
    missionId: text(missionId, "Identifiant de mission"),
    observationId: text(observationId, "Identifiant d’observation"),
    context: String(context || "").trim(),
    fileName: normalizedName,
    mimeType: text(mimeType, "Type de fichier").toLowerCase(),
    sizeBytes: payload.byteLength,
    createdAt,
    destination: normalizedDestination,
    relativePath: `Falcon/Médias/${folder}/${id} — ${normalizedName}`,
    localReference: localStored ? `idb://FalconEnterpriseR4/media/${id}` : null,
    integrity: Object.freeze({ algorithm: "SHA-256", digest }),
    transfer: Object.freeze({
      local: localStored ? "pending" : "not-requested",
      gallery: galleryRequested ? "pending" : "not-requested",
      synchronization: "local"
    })
  });
}

export async function verifyMediaIntegrity(envelope, bytes) {
  if (envelope?.schema !== MEDIA_DESTINATION_SCHEMA || envelope?.integrity?.algorithm !== "SHA-256") {
    throw new MediaDestinationError("Enveloppe média invalide.", "INVALID_ENVELOPE");
  }
  const actual = await sha256Bytes(bytes);
  return Object.freeze({
    valid: actual === envelope.integrity.digest,
    expected: envelope.integrity.digest,
    actual
  });
}

export function updateMediaTransfer(envelope, patch = {}, { now = () => new Date().toISOString() } = {}) {
  if (envelope?.schema !== MEDIA_DESTINATION_SCHEMA) {
    throw new MediaDestinationError("Enveloppe média invalide.", "INVALID_ENVELOPE");
  }
  const allowed = {
    local: ["not-requested", "pending", "stored", "error"],
    gallery: ["not-requested", "pending", "share-requested", "confirmed", "error"],
    synchronization: ["local", "pending", "synchronizing", "synchronized", "conflict", "error", "recovery-required"]
  };
  const transfer = { ...envelope.transfer };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed[key]?.includes(value)) {
      throw new MediaDestinationError(`État de transfert invalide : ${key}.`, "INVALID_TRANSFER_STATE");
    }
    transfer[key] = value;
  }
  return Object.freeze({
    ...envelope,
    transfer: Object.freeze(transfer),
    updatedAt: String(now())
  });
}
