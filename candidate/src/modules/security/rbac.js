export const RBAC_VERSION = "V46.8.0";

export const PERMISSIONS = Object.freeze([
  "mission.read","mission.create","mission.update","mission.delete","mission.archive","mission.restore","mission.export",
  "session.read","session.create","session.update","session.activate","session.archive",
  "document.read","document.create","document.update","document.delete","document.archive","document.restore","document.export",
  "report.read","report.create","report.update","report.export",
  "analysis.read","analysis.create","analysis.update","analysis.delete",
  "action.read","action.create","action.update","action.close","action.delete",
  "media.read","media.create","media.delete","media.export",
  "ai.use","ai.configure","sync.prepare","sync.execute","module.read","module.configure",
  "security.read","security.configure","license.read","license.configure","admin.full"
]);

const BASE_READ = Object.freeze([
  "mission.read","session.read","document.read","report.read","analysis.read",
  "action.read","media.read","module.read","license.read"
]);

function permissionSet(items) {
  return Object.freeze(Object.fromEntries(items.map((item) => [item, true])));
}

const ALL_EXCEPT_SUPER_ADMIN = PERMISSIONS.filter((permission) => permission !== "admin.full");

export const PROFILES = Object.freeze({
  "Super Administrateur": Object.freeze({
    level: 100,
    permissions: permissionSet(PERMISSIONS),
    description: "Contrôle total local, réservé gouvernance Enterprise."
  }),
  "Administrateur": Object.freeze({
    level: 90,
    permissions: permissionSet(ALL_EXCEPT_SUPER_ADMIN),
    description: "Administration opérationnelle hors super-admin."
  }),
  "Responsable": Object.freeze({
    level: 75,
    permissions: permissionSet(BASE_READ.concat([
      "mission.create","mission.update","mission.archive",
      "session.create","session.update","session.activate","session.archive",
      "document.create","document.update","document.archive",
      "report.export","analysis.create","analysis.update",
      "action.create","action.update","action.close",
      "media.create","media.export","sync.prepare",
      "module.read","security.read"
    ])),
    description: "Pilotage mission et supervision."
  }),
  "Consultant Senior": Object.freeze({
    level: 70,
    permissions: permissionSet(BASE_READ.concat([
      "mission.create","mission.update","mission.archive","mission.export",
      "session.create","session.update","session.activate","session.archive",
      "document.create","document.update","document.archive","document.restore","document.export",
      "report.create","report.update","report.export",
      "analysis.create","analysis.update","analysis.delete",
      "action.create","action.update","action.close",
      "media.create","media.delete","media.export",
      "ai.use","sync.prepare","module.read"
    ])),
    description: "Production complète d’audit sans administration système."
  }),
  "Auditeur": Object.freeze({
    level: 60,
    permissions: permissionSet(BASE_READ.concat([
      "mission.update","session.create","session.update","session.activate",
      "document.create","document.update",
      "report.create","analysis.create","analysis.update",
      "action.create","action.update","media.create","ai.use","module.read"
    ])),
    description: "Contribution terrain et analyse."
  }),
  "Préventeur": Object.freeze({
    level: 55,
    permissions: permissionSet(BASE_READ.concat([
      "mission.update","session.create","session.update","session.activate",
      "document.create","analysis.create","analysis.update",
      "action.create","action.update","media.create","module.read"
    ])),
    description: "Prévention et plans d’actions."
  }),
  "Client": Object.freeze({
    level: 35,
    permissions: permissionSet([
      "mission.read","session.read","document.read","report.read","action.read",
      "action.update","media.read","module.read"
    ]),
    description: "Lecture client et suivi limité."
  }),
  "Lecteur": Object.freeze({
    level: 20,
    permissions: permissionSet(BASE_READ),
    description: "Consultation seule."
  }),
  "Démonstration": Object.freeze({
    level: 10,
    permissions: permissionSet([
      "mission.read","session.read","document.read","report.read","analysis.read",
      "action.read","media.read","module.read"
    ]),
    description: "Profil démo non destructif."
  })
});

export function getProfile(profileName) {
  return PROFILES[profileName] ?? null;
}

export function can(profileName, permission) {
  const profile = getProfile(profileName);
  return Boolean(profile?.permissions?.[permission] || profile?.permissions?.["admin.full"]);
}

export function listProfilePermissions(profileName) {
  const profile = getProfile(profileName);
  if (!profile) return [];
  return PERMISSIONS.filter((permission) => can(profileName, permission));
}
