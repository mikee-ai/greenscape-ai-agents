import type { Env } from "../env.ts";
import type { Lead, Settings } from "../db/schema.ts";
import { callTool } from "./client.ts";
import { REACTIVATION_TOOL, reactivationSchema } from "./schemas.ts";
import { buildReactivationSystem, buildReactivationUser } from "./prompts.ts";
import { MODELS, type Usage } from "./models.ts";
import { timeAgo } from "../lib/time.ts";

export interface ReactivationOutput {
  subject: string;
  messageMd: string;
  usesRealContext: boolean;
  model: string;
  costCents: number;
  usage: Usage;
}

/** Generate one personalized, Marcus-voiced re-engagement message for a lead. */
export async function generateReactivation(
  env: Env,
  lead: Pick<Lead, "name" | "projectType" | "notes" | "closedLostAt" | "createdAt">,
  settings: Pick<Settings, "companyName" | "brandVoiceNotes">,
): Promise<ReactivationOutput> {
  const monthsAgoLabel = timeAgo(lead.closedLostAt ?? lead.createdAt);
  const res = await callTool(env, {
    model: MODELS.reactivate,
    system: buildReactivationSystem(settings),
    messages: [
      {
        role: "user",
        content: buildReactivationUser({
          name: lead.name,
          projectType: lead.projectType,
          notes: lead.notes,
          monthsAgoLabel,
        }),
      },
    ],
    tool: REACTIVATION_TOOL,
    schema: reactivationSchema,
    maxTokens: 600,
    retries: 1,
  });
  return {
    subject: res.data.subject,
    messageMd: res.data.message_md,
    usesRealContext: res.data.uses_real_context,
    model: res.model,
    costCents: res.costCents,
    usage: res.usage,
  };
}
