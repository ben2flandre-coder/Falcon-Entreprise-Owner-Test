export const AI_CONNECTION_SCHEMA = "falcon.ai.connection.v1";

export const AI_PROVIDERS = Object.freeze({
  disabled: Object.freeze({
    id: "disabled",
    label: "Désactivé",
    keyUrl: null,
    defaultEndpoint: "",
    requiresKey: false,
    remote: false
  }),
  anthropic: Object.freeze({
    id: "anthropic",
    label: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    requiresKey: true,
    remote: true
  }),
  openai_compatible: Object.freeze({
    id: "openai_compatible",
    label: "API compatible OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    requiresKey: true,
    remote: true
  }),
  mistral_compatible: Object.freeze({
    id: "mistral_compatible",
    label: "Mistral AI",
    keyUrl: "https://console.mistral.ai/api-keys",
    defaultEndpoint: "https://api.mistral.ai/v1/chat/completions",
    requiresKey: true,
    remote: true
  }),
  ollama_local: Object.freeze({
    id: "ollama_local",
    label: "Ollama local",
    keyUrl: null,
    defaultEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
    requiresKey: false,
    remote: false
  }),
  custom: Object.freeze({
    id: "custom",
    label: "Endpoint compatible personnalisé",
    keyUrl: null,
    defaultEndpoint: "",
    requiresKey: false,
    remote: true
  })
});

export const AI_PROMPT_EXAMPLES = Object.freeze([
  "Résume ces constats sans ajouter de fait et cite les identifiants d’observation.",
  "Propose trois options d’action ; distingue faits, hypothèses et points à vérifier.",
  "Relis ce paragraphe du rapport et signale uniquement les formulations ambiguës."
]);

export const AI_TROUBLESHOOTING = Object.freeze([
  Object.freeze({ code: "401/403", cause: "Clé absente, expirée ou sans droit.", action: "Remplacer la clé puis relancer le test minimal." }),
  Object.freeze({ code: "404", cause: "Endpoint ou modèle incorrect.", action: "Vérifier l’URL et le nom exact du modèle chez le fournisseur." }),
  Object.freeze({ code: "429", cause: "Quota ou limite de débit atteint.", action: "Attendre, réduire la fréquence ou vérifier le quota." }),
  Object.freeze({ code: "CORS", cause: "Le fournisseur refuse les appels directs du navigateur.", action: "Utiliser un endpoint local autorisé ou un relais administré par l’organisation." }),
  Object.freeze({ code: "Hors ligne", cause: "Aucun réseau vers un fournisseur distant.", action: "Continuer sans IA ; Falcon et le dossier restent utilisables localement." })
]);

export class AIConnectionError extends Error {
  constructor(message, code = "AI_CONNECTION_ERROR") {
    super(message);
    this.name = "AIConnectionError";
    this.code = code;
  }
}

export function normalizeAIConfiguration(configuration = {}) {
  const provider = AI_PROVIDERS[configuration.provider] || AI_PROVIDERS.disabled;
  const endpoint = String(configuration.endpoint || provider.defaultEndpoint).trim();
  const apiKey = String(configuration.apiKey || "").trim();
  const model = String(configuration.model || "").trim();
  const enabled = Boolean(configuration.enabled) && provider.id !== "disabled";
  const connectionMode = configuration.connectionMode === "permanent" ? "permanent" : "punctual";
  return Object.freeze({
    schema: AI_CONNECTION_SCHEMA,
    provider: provider.id,
    endpoint,
    model,
    apiKey,
    enabled,
    connectionMode,
    ready: enabled && Boolean(endpoint) && Boolean(model) && (!provider.requiresKey || Boolean(apiKey))
  });
}

export function aiDataDisclosure({ includeImage = false, includeVoice = false } = {}) {
  const sent = [
    "le prompt saisi pour l’action",
    "le texte explicitement sélectionné",
    "le nom du modèle et les paramètres techniques"
  ];
  if (includeImage) sent.push("l’image explicitement jointe");
  if (includeVoice) sent.push("la transcription explicitement jointe");
  return Object.freeze({
    sent: Object.freeze(sent),
    notSent: Object.freeze([
      "le dossier complet",
      "les autres observations",
      "les médias non sélectionnés",
      "les clés et réglages Falcon",
      "l’historique local"
    ]),
    limits: Object.freeze([
      "Une clé stockée dans un navigateur local reste accessible aux personnes ayant accès au profil de ce navigateur.",
      "Un fournisseur distant applique ses propres conditions de conservation et de traitement.",
      "Ne transmettez pas de secret, de donnée personnelle inutile ou d’information classifiée."
    ])
  });
}

export function createAIConnectionTest(configuration = {}) {
  const config = normalizeAIConfiguration(configuration);
  if (!config.enabled) throw new AIConnectionError("Activez un fournisseur avant le test.", "AI_DISABLED");
  if (!config.endpoint) throw new AIConnectionError("L’endpoint IA est obligatoire.", "ENDPOINT_REQUIRED");
  if (!config.model) throw new AIConnectionError("Le modèle IA est obligatoire.", "MODEL_REQUIRED");
  const provider = AI_PROVIDERS[config.provider];
  if (provider.requiresKey && !config.apiKey) {
    throw new AIConnectionError("La clé API est obligatoire pour ce fournisseur.", "KEY_REQUIRED");
  }

  const signalText = "Réponds uniquement FALCON_OK. Ceci est un test de connexion sans donnée de dossier.";
  if (config.provider === "anthropic") {
    return Object.freeze({
      url: config.endpoint,
      options: Object.freeze({
        method: "POST",
        headers: Object.freeze({
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        }),
        body: JSON.stringify({
          model: config.model,
          max_tokens: 20,
          messages: [{ role: "user", content: signalText }]
        })
      }),
      disclosure: "Test minimal : aucun contenu du dossier n’est envoyé."
    });
  }
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey && config.provider !== "ollama_local") headers.Authorization = `Bearer ${config.apiKey}`;
  return Object.freeze({
    url: config.endpoint,
    options: Object.freeze({
      method: "POST",
      headers: Object.freeze(headers),
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: signalText }],
        temperature: 0,
        max_tokens: 20
      })
    }),
    disclosure: "Test minimal : aucun contenu du dossier n’est envoyé."
  });
}

export function describeAIAvailability(configuration = {}, online = true) {
  const config = normalizeAIConfiguration(configuration);
  if (!config.enabled) return Object.freeze({ status: "disabled", usable: false, detail: "IA désactivée ; toutes les fonctions locales restent disponibles." });
  const provider = AI_PROVIDERS[config.provider];
  if (!online && provider.remote) return Object.freeze({ status: "offline", usable: false, detail: "Fournisseur distant indisponible hors réseau ; aucune donnée n’est mise en file automatiquement." });
  if (!config.ready) return Object.freeze({ status: "incomplete", usable: false, detail: "Configuration incomplète ; vérifiez endpoint, modèle et clé." });
  return Object.freeze({ status: "ready", usable: true, detail: config.connectionMode === "permanent" ? "Configuration conservée sur cet appareil." : "Clé conservée uniquement jusqu’à la fin de la session." });
}
