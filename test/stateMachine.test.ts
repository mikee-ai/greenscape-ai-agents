import { describe, it, expect } from "vitest";
import { canTransition, isTerminal, PUBLIC_STATUSES } from "../src/services/stateMachine.ts";

describe("proposal state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("draft", "extracting")).toBe(true);
    expect(canTransition("extracting", "needs_review")).toBe(true);
    expect(canTransition("needs_review", "approved")).toBe(true);
    expect(canTransition("approved", "sent")).toBe(true);
    expect(canTransition("sent", "viewed")).toBe(true);
    expect(canTransition("viewed", "deposit_paid")).toBe(true);
    expect(canTransition("sent", "deposit_paid")).toBe(true);
  });

  it("makes approval idempotent (cannot re-approve once sent)", () => {
    expect(canTransition("sent", "approved")).toBe(false);
    expect(canTransition("approved", "approved")).toBe(false);
  });

  it("forbids skipping approval", () => {
    expect(canTransition("needs_review", "sent")).toBe(false);
  });

  it("treats deposit_paid and lost as terminal", () => {
    expect(isTerminal("deposit_paid")).toBe(true);
    expect(isTerminal("lost")).toBe(true);
    expect(canTransition("deposit_paid", "sent")).toBe(false);
    expect(canTransition("lost", "approved")).toBe(false);
  });

  it("lets an errored proposal recover or be regenerated", () => {
    expect(canTransition("error", "needs_review")).toBe(true);
    expect(canTransition("error", "extracting")).toBe(true);
  });

  it("only exposes sent/viewed/deposit_paid publicly", () => {
    expect(PUBLIC_STATUSES.has("sent")).toBe(true);
    expect(PUBLIC_STATUSES.has("viewed")).toBe(true);
    expect(PUBLIC_STATUSES.has("deposit_paid")).toBe(true);
    expect(PUBLIC_STATUSES.has("needs_review")).toBe(false);
    expect(PUBLIC_STATUSES.has("draft")).toBe(false);
  });
});
