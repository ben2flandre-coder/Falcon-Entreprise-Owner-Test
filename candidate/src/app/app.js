import { FALCON_VERSION, FALCON_BUILD, FALCON_BASELINE } from "../core/version.js";
import { FALCON_CAPABILITIES } from "../core/capabilities.js";
import { createCommercialProductIntegration } from "../modules/commercial/commercial-product-integration.js";
import { createCommercialOnboardingService } from "../modules/commercial/commercial-onboarding-service.js";
import { setupRbacPanel } from "./controllers/rbac-panel.js";
import { setupStoragePanel } from "./controllers/storage-panel.js";
import { setupMissionPanel } from "./controllers/mission-panel.js";
import { setupOnboardingPanel } from "./controllers/onboarding-panel.js";
import { setupNavigationShell } from "./controllers/navigation-shell.js";

const byId = (id) => document.querySelector(`#${id}`);
const element = (tag, text, className = "") => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

byId("build-meta").textContent = `Version ${FALCON_VERSION} · ${FALCON_BUILD} · baseline contrôlée ${FALCON_BASELINE.controlled}`;

const capabilities = byId("capabilities");
for (const capability of FALCON_CAPABILITIES) {
  const card = document.createElement("article");
  card.className = `capability status-${capability.status}`;
  card.append(
    element("strong", capability.id),
    element("span", `Niveau ${capability.level}`),
    element("small", capability.status)
  );
  capabilities.append(card);
}

const rbac = setupRbacPanel({
  profileSelect: byId("profile-select"),
  profileSummary: byId("profile-summary"),
  permissionChecks: byId("permission-checks")
});

const storage = setupStoragePanel({
  appVersion: FALCON_VERSION,
  status: byId("storage-status"),
  summary: byId("storage-summary"),
  valueInput: byId("storage-value"),
  writeButton: byId("storage-write"),
  readButton: byId("storage-read"),
  removeButton: byId("storage-remove"),
  result: byId("storage-result"),
  log: byId("storage-log")
});

const commercial = storage.engine
  ? createCommercialProductIntegration({ storage: storage.engine })
  : null;
const onboarding = storage.engine
  ? createCommercialOnboardingService({ storage: storage.engine })
  : null;
const access = commercial ? commercial.createAccessController(rbac) : rbac;
const missionPersistence = commercial
  ? Object.freeze({
      read: () => commercial.read("mission-registry", null),
      write: (value) => commercial.write("mission-registry", value)
    })
  : null;

const missions = setupMissionPanel({
  rbac: access,
  persistence: missionPersistence,
  status: byId("mission-status"),
  summary: byId("mission-summary"),
  nameInput: byId("mission-name"),
  clientInput: byId("mission-client"),
  scopeInput: byId("mission-scope"),
  createButton: byId("mission-create"),
  feedback: byId("mission-feedback"),
  list: byId("mission-list")
});

const onboardingPanel = setupOnboardingPanel({
  onboarding,
  rbac,
  status: byId("onboarding-status"),
  organisationInput: byId("onboarding-organisation"),
  administratorInput: byId("onboarding-administrator"),
  clientInput: byId("onboarding-client"),
  supportContactInput: byId("onboarding-support"),
  saveButton: byId("onboarding-save"),
  feedback: byId("onboarding-feedback"),
  summary: byId("onboarding-summary")
});

const navigation = setupNavigationShell({
  rbac: access,
  storage,
  appNavigation: byId("app-navigation"),
  feedback: byId("navigation-feedback"),
  status: byId("navigation-status"),
  summary: byId("navigation-summary"),
  log: byId("navigation-log"),
  routePanels: [...document.querySelectorAll("[data-route-panel]")]
});

rbac.subscribe(() => {
  missions.render();
  onboardingPanel.render();
  navigation.refresh();
});

if (commercial && onboarding) {
  const switchMissionSpace = (operation) => {
    const result = operation();
    missions.reload();
    navigation.refresh();
    return result;
  };

  Object.defineProperty(window, "FalconCommercial", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      snapshot: commercial.snapshot,
      activateDemonstration: (options) => switchMissionSpace(() => commercial.activateDemonstration(options)),
      returnToProduction: (options) => switchMissionSpace(() => commercial.returnToProduction(options)),
      resetDemonstration: (options) => switchMissionSpace(() => commercial.resetDemonstration(options)),
      saveLicense: commercial.saveLicense,
      clearLicense: commercial.clearLicense,
      configureOnboarding: onboarding.configure,
      onboardingSnapshot: onboarding.snapshot,
      exportCurrentSpace: commercial.exportCurrentSpace,
      recentAudit: commercial.recentAudit
    })
  });
}
