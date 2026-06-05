import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import type { Env } from "../env.ts";
import { costCents, type Usage } from "./models.ts";

export class ClaudeError extends Error {}

export interface ToolResult<T> {
  data: T;
  model: string;
  usage: Usage;
  costCents: number;
}

interface CallToolOpts<T> {
  model: string;
  system: Anthropic.Messages.TextBlockParam[] | string;
  messages: Anthropic.Messages.MessageParam[];
  tool: Anthropic.Messages.Tool;
  schema: ZodType<T>;
  maxTokens: number;
  /** extra retries after the first attempt (default 1). */
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Choose the backend. Local Ollama (free, on-box) or the Anthropic API. */
function pickProvider(env: Env): "local" | "anthropic" {
  if (env.LLM_PROVIDER === "local") return "local";
  if (env.LLM_PROVIDER === "anthropic") return "anthropic";
  if (env.OLLAMA_BASE_URL) return "local";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  throw new ClaudeError("No LLM configured (set LLM_PROVIDER + OLLAMA_BASE_URL, or ANTHROPIC_API_KEY)");
}

/**
 * Single structured-output call with schema validation + bounded retry.
 * Routes to the local Ollama model or Claude; both are asked for JSON matching
 * the same schema, so all downstream code (mapScope, pricing) is unchanged.
 * The caller owns the always-editable fallback when this ultimately throws.
 */
export async function callTool<T>(env: Env, opts: CallToolOpts<T>): Promise<ToolResult<T>> {
  return pickProvider(env) === "local" ? callOllamaTool(env, opts) : callAnthropicTool(env, opts);
}

// ── local: Ollama /api/chat with a JSON-schema `format` ───────────────
function flattenSystem(system: CallToolOpts<unknown>["system"]): string {
  if (typeof system === "string") return system;
  return system.map((b) => ("text" in b ? b.text : "")).join("\n\n");
}

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // strip ```json fences / grab the outermost object
    const fenced = content.replace(/```(?:json)?/gi, "").trim();
    try {
      return JSON.parse(fenced);
    } catch {
      const s = fenced.indexOf("{");
      const e = fenced.lastIndexOf("}");
      if (s >= 0 && e > s) return JSON.parse(fenced.slice(s, e + 1));
      throw new ClaudeError("model did not return parseable JSON");
    }
  }
}

async function callOllamaTool<T>(env: Env, opts: CallToolOpts<T>): Promise<ToolResult<T>> {
  const base = (env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = env.LOCAL_LLM_MODEL || "qwen3:8b";
  const retries = opts.retries ?? 1;

  const system =
    flattenSystem(opts.system) +
    `\n\nRespond with ONLY a single JSON object matching the required schema — no markdown, no commentary, no <think> output.`;
  const messages = [
    { role: "system", content: system },
    ...opts.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
  ];

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          think: false, // disable qwen3 thinking → clean JSON, faster
          format: opts.tool.input_schema, // schema-forced structured output
          options: { temperature: 0.4, num_predict: opts.maxTokens },
        }),
      });
      if (!resp.ok) throw new ClaudeError(`Ollama ${resp.status}: ${await resp.text()}`);
      const j = (await resp.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const parsed = opts.schema.safeParse(extractJson(j.message?.content ?? ""));
      if (!parsed.success) {
        throw new ClaudeError("local model output failed schema: " + JSON.stringify(parsed.error.issues));
      }
      const usage: Usage = { input: j.prompt_eval_count ?? 0, output: j.eval_count ?? 0 };
      return { data: parsed.data, model, usage, costCents: 0 }; // local inference = $0
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(800);
    }
  }
  throw lastErr instanceof Error ? lastErr : new ClaudeError(String(lastErr));
}

// ── cloud: Anthropic forced tool-use ──────────────────────────────────
async function callAnthropicTool<T>(env: Env, opts: CallToolOpts<T>): Promise<ToolResult<T>> {
  if (!env.ANTHROPIC_API_KEY) throw new ClaudeError("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const retries = opts.retries ?? 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system as unknown as Anthropic.Messages.MessageCreateParams["system"],
        messages: opts.messages,
        tools: [opts.tool],
        tool_choice: { type: "tool", name: opts.tool.name },
      });

      const block = resp.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        throw new ClaudeError("model did not return a tool_use block");
      }
      const parsed = opts.schema.safeParse(block.input);
      if (!parsed.success) {
        throw new ClaudeError("tool input failed schema: " + JSON.stringify(parsed.error.issues));
      }
      const u = resp.usage;
      const usage: Usage = {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheCreate: u.cache_creation_input_tokens ?? 0,
      };
      return { data: parsed.data, model: opts.model, usage, costCents: costCents(opts.model, usage) };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(800);
    }
  }
  throw lastErr instanceof Error ? lastErr : new ClaudeError(String(lastErr));
}
