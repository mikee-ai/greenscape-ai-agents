/**
 * Markdown → HTML for model-written proposal prose. Uses markdown-it with
 * `html: false`, so raw HTML in the source is ESCAPED (the model can never
 * inject markup) while the full markdown feature set — tables, links, images,
 * ordered/unordered lists, blockquotes, code — renders. Output is wrapped with
 * hono `raw()` at the call site.
 *
 * Headings are shifted down two levels (`#` → <h3>, `##` → <h4>, …) so that
 * AI-written subheadings stay visually subordinate to the page's section <h3>s.
 */
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false, // escape raw HTML — prose is model-generated and untrusted
  linkify: true, // turn bare URLs into links
  breaks: true, // single newline → <br> (matches the old paragraph feel)
  typographer: true, // smart quotes / dashes for a polished look
});

// Shift every heading down two levels so prose headings sit under section <h3>s.
md.core.ruler.push("downshift_headings", (state) => {
  for (const t of state.tokens) {
    if (t.type === "heading_open" || t.type === "heading_close") {
      const level = Math.min(6, Number(t.tag.slice(1)) + 2);
      t.tag = `h${level}`;
    }
  }
});

export function renderMarkdown(input: string | null | undefined): string {
  if (!input) return "";
  return md.render(input);
}
