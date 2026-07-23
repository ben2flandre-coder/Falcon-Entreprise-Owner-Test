export function createExecutiveCard({ id, title, value, description = "", status = "neutral", href = null } = {}) {
  if (!id || !title) throw new TypeError("Executive card requires id and title.");
  const article = document.createElement("article");
  article.className = "falcon-executive-card";
  article.dataset.status = status;
  article.id = id;

  const heading = document.createElement("h2");
  heading.textContent = title;

  const metric = document.createElement("p");
  metric.className = "falcon-executive-card__value";
  metric.textContent = String(value ?? "—");

  const detail = document.createElement("p");
  detail.className = "falcon-executive-card__description";
  detail.textContent = description;

  article.append(heading, metric, detail);

  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.className = "falcon-executive-card__link";
    link.textContent = `Ouvrir ${title}`;
    article.append(link);
  }

  return article;
}
