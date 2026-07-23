export function setupOnboardingPanel({
  onboarding,
  rbac,
  status,
  organisationInput,
  administratorInput,
  clientInput,
  supportContactInput,
  saveButton,
  feedback,
  summary
}) {
  function setFeedback(message, tone = "neutral") {
    feedback.className = `navigation-feedback ${tone}`;
    feedback.textContent = message;
  }

  function render() {
    if (!onboarding) {
      status.textContent = "Indisponible";
      status.className = "status-pill error";
      saveButton.disabled = true;
      summary.replaceChildren();
      setFeedback("Le service de configuration initiale nécessite le stockage local.", "error");
      return;
    }

    const snapshot = onboarding.snapshot();
    status.textContent = snapshot.configured ? "Configuré" : "À configurer";
    status.className = `status-pill ${snapshot.configured ? "ok" : ""}`;
    saveButton.disabled = !rbac.can("security.configure");

    const record = snapshot.record;
    if (record) {
      organisationInput.value = record.organisation;
      administratorInput.value = record.administrator;
      clientInput.value = record.client;
      supportContactInput.value = record.supportContact || "";
    }

    summary.replaceChildren();
    for (const [value, label] of [
      [record?.organisation || "Non renseignée", "organisation"],
      [record?.administrator || "Non renseigné", "administrateur"],
      [record?.client || "Non renseigné", "client initial"],
      [record?.configuredAt || "—", "dernière configuration"]
    ]) {
      const card = document.createElement("article");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      card.className = "navigation-card";
      strong.textContent = value;
      span.textContent = label;
      card.append(strong, span);
      summary.append(card);
    }
  }

  saveButton.addEventListener("click", () => {
    try {
      if (!rbac.can("security.configure")) throw new Error("Le profil actif ne peut pas configurer Falcon.");
      const result = onboarding.configure({
        organisation: organisationInput.value,
        administrator: administratorInput.value,
        client: clientInput.value,
        supportContact: supportContactInput.value.trim() || null
      });
      if (!result.persisted) throw new Error("La configuration initiale n’a pas pu être enregistrée.");
      setFeedback("Configuration initiale enregistrée localement.", "success");
    } catch (error) {
      setFeedback(error.message || "Configuration initiale impossible.", "error");
    }
    render();
  });

  render();
  return Object.freeze({ render });
}
