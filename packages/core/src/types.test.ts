import { describe, it, expect } from "vitest";
import type { AssistantInput, Channel, UserStatus, TaskStatus, Intent, Complexity, Classification } from "./types.js";
import { REGION, MODELS, BEDROCK_VERSION, MEMORY_TABLE, EMBEDDING_DIM, SHORT_TERM_LIMIT, SQS_MAX_DELAY_SECS } from "./constants.js";

describe("constants", () => {
  it("REGION is ap-southeast-1", () => expect(REGION).toBe("ap-southeast-1"));
  it("MODELS.HAIKU exists", () => expect(MODELS.HAIKU).toContain("haiku"));
  it("MODELS.SONNET exists", () => expect(MODELS.SONNET).toContain("sonnet"));
  it("MODELS.TITAN_EMBED exists", () => expect(MODELS.TITAN_EMBED).toContain("titan"));
  it("EMBEDDING_DIM is a positive number", () => expect(EMBEDDING_DIM).toBeGreaterThan(0));
  it("SQS_MAX_DELAY_SECS is 900", () => expect(SQS_MAX_DELAY_SECS).toBe(900));
  it("BEDROCK_VERSION is set", () => expect(BEDROCK_VERSION).toBeTruthy());
  it("MEMORY_TABLE is set", () => expect(MEMORY_TABLE).toBe("memories"));
});
