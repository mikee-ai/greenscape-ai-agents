/**
 * Proposal status transitions. Pure + tested. Used to make Approve idempotent
 * (only needs_review → approved is allowed) and to guard illegal jumps
 * (e.g. needs_review → sent must pass through approved; deposit_paid is terminal).
 */
import type { ProposalStatus } from "../db/schema.ts";

const ALLOWED: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["extracting", "lost"],
  extracting: ["drafting", "needs_review", "error"],
  drafting: ["needs_review", "error"],
  error: ["extracting", "needs_review", "lost"],
  needs_review: ["extracting", "approved", "lost"], // "extracting" = regenerate
  approved: ["sent", "lost"],
  sent: ["viewed", "deposit_paid", "lost"],
  viewed: ["deposit_paid", "lost"],
  deposit_paid: [],
  lost: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function isTerminal(s: ProposalStatus): boolean {
  return (ALLOWED[s]?.length ?? 0) === 0;
}

/** Statuses whose proposal is publicly viewable at /p/:token. */
export const PUBLIC_STATUSES: ReadonlySet<ProposalStatus> = new Set([
  "sent",
  "viewed",
  "deposit_paid",
]);
