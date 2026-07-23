import {
  PERMISSIONS,
  PROFILES,
  can,
  listProfilePermissions
} from "../../modules/security/rbac.js";

const REPRESENTATIVE_PERMISSIONS = Object.freeze([
  "mission.read",
  "mission.update",
  "document.create",
  "report.export",
  "ai.use",
  "security.configure",
  "admin.full"
]);

function textElement(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function securityCard(title, label, detail) {
  const card = document.createElement("article");
  card.className = "security-card";
  card.append(
    textElement("strong", title),
    textElement("span", label),
    textElement("small", detail)
  );
  return card;
}

export function setupRbacPanel({
  profileSelect,
  profileSummary,
  permissionChecks,
  initialProfile = "Consultant Senior"
}) {
  const listeners = new Set();

  for (const profileName of Object.keys(PROFILES)) {
    const option = document.createElement("option");
    option.value = profileName;
    option.textContent = profileName;
    profileSelect.append(option);
  }

  profileSelect.value = initialProfile;

  function render(profileName = profileSelect.value) {
    const profile = PROFILES[profileName];
    const allowedPermissions = listProfilePermissions(profileName);

    profileSummary.replaceChildren(
      securityCard(profileName, `Niveau ${profile.level}`, profile.description),
      securityCard(String(allowedPermissions.length), "droits actifs", `sur ${PERMISSIONS.length} permissions de référence`)
    );

    permissionChecks.replaceChildren();
    for (const permission of REPRESENTATIVE_PERMISSIONS) {
      const allowed = can(profileName, permission);
      const item = document.createElement("article");
      item.className = `permission-check ${allowed ? "allowed" : "denied"}`;
      item.append(
        textElement("strong", permission),
        textElement("span", allowed ? "Autorisé" : "Refusé")
      );
      permissionChecks.append(item);
    }
  }

  profileSelect.addEventListener("change", (event) => {
    render(event.target.value);
    for (const listener of listeners) listener(event.target.value);
  });

  render();

  return Object.freeze({
    get value() {
      return profileSelect.value;
    },
    can: (permission) => can(profileSelect.value, permission),
    render,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("RBAC listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
