import type { Env } from "../env.ts";
import type { Settings } from "../db/schema.ts";
import { callTool } from "./client.ts";
import { PROPOSAL_COPY_TOOL, proposalCopySchema, type ProposalCopy } from "./schemas.ts";
import { buildDraftSystem, buildDraftUser } from "./prompts.ts";
import { MODELS, type Usage } from "./models.ts";

export interface DraftOutput {
  copy: ProposalCopy;
  model: string;
  costCents: number;
  usage: Usage;
}

/** Call 2: priced/validated scope → persuasive proposal prose (no prices). */
export async function draftProposalCopy(
  env: Env,
  input: {
    settings: Pick<Settings, "companyName" | "brandVoiceNotes">;
    clientName: string;
    projectType: string | null;
    items: { name: string; quantity: number; unit: string }[];
    specialConditions: string[];
  },
): Promise<DraftOutput> {
  const res = await callTool(env, {
    model: MODELS.draft,
    system: buildDraftSystem(input.settings),
    messages: [
      {
        role: "user",
        content: buildDraftUser({
          clientName: input.clientName,
          projectType: input.projectType,
          items: input.items,
          specialConditions: input.specialConditions,
        }),
      },
    ],
    tool: PROPOSAL_COPY_TOOL,
    schema: proposalCopySchema,
    maxTokens: 2000,
    retries: 1,
  });
  return { copy: res.data, model: res.model, costCents: res.costCents, usage: res.usage };
}
