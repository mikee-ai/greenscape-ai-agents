/**
 * Tiny, safe markdown → HTML renderer. HTML is escaped FIRST, then a small set
 * of inline/block rules is applied — so model-written prose can never inject
 * markup. Handles: ## / ### headings, - / * bullet lists, **bold**, *italic*,
 * and paragraphs. Output is wrapped with hono `raw()` at the call site.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  const lines = escapeHtml(md).split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^[-*]\s+/.test(t)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`;
      continue;
    }
    closeList();
    if (!t) continue;
    if (/^###\s+/.test(t)) html += `<h4>${inline(t.replace(/^###\s+/, ""))}</h4>`;
    else if (/^##\s+/.test(t)) html += `<h3>${inline(t.replace(/^##\s+/, ""))}</h3>`;
    else if (/^#\s+/.test(t)) html += `<h3>${inline(t.replace(/^#\s+/, ""))}</h3>`;
    else html += `<p>${inline(t)}</p>`;
  }
  closeList();
  return html;
}
