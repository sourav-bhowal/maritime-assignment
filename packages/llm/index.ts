import { ClaudeProvider } from "./src/providers/claude.js";
import { GeminiProvider } from "./src/providers/gemini.js";
import { OpenAIProvider } from "./src/providers/openai.js";
import { EXTRACTION_PROMPT_VERSION } from "./src/prompts.js";
import type { LLMProvider } from "./src/types.js";

export { EXTRACTION_PROMPT_VERSION };

export type { LLMProvider } from "./src/types.js";
export type {
  ExtractionResult,
  ValidationResult,
  Detection,
  Holder,
  ExtractedField,
  Validity,
  Compliance,
  MedicalData,
  ExtractionFlag,
  ConsistencyCheck,
  MissingDocument,
  ExpiringDocument,
  MedicalFlag,
  HolderProfile,
} from "./src/types.js";

/**
 * Create an LLM provider instance based on the LLM_PROVIDER env variable.
 * Supports: "claude", "gemini", "openai".
 */
export function createLLM(): LLMProvider {
  const provider = process.env.LLM_PROVIDER;

  switch (provider) {
    case "claude":
      return new ClaudeProvider();

    case "gemini":
      return new GeminiProvider();

    case "openai":
      return new OpenAIProvider();

    default:
      throw new Error(
        `Unsupported LLM provider: "${provider}". Set LLM_PROVIDER to one of: claude, gemini, openai`,
      );
  }
}
