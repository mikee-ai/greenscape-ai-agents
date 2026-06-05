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

/**
 * Single forced-tool call with schema validation + bounded retry.
 *
 * Robustness: the model is forced to call the tool (no free-text escape), the
 * tool input is re-validated with Zod (schema-valid JSON can still be wrong),
 * and transient failures (overload / 5xx / malformed) get one retry. The caller
 * is responsible for the always-editable fallback when this ultimately throws.
 */
export async function callTool<T>(env: Env, opts: CallToolOpts<T>): Promise<ToolResult<T>> {
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
