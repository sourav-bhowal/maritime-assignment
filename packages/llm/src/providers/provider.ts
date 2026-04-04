import { extractJson } from "../utils.js";
import type { ExtractionResult, ValidationResult } from "../types.js";

/**
 * Base class for all LLM providers.
 * Provides shared utilities: timeout handling, safe JSON parsing.
 */
export abstract class BaseLLMProvider {
  protected timeoutMs = 30_000; // 30 seconds

  /**
   * Race a promise against a timeout.
   * @param promise - Promise to timeout.
   * @returns The resolved value or throws LLM_TIMEOUT.
   */
  protected async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM_TIMEOUT")), this.timeoutMs),
    );

    return Promise.race([promise, timeout]);
  }

  /**
   * Attempt to parse JSON from raw LLM output.
   * If the first attempt fails (e.g. markdown fences), call
   * the provider-specific repair function to ask the LLM to fix it.
   */
  protected async safeParse<T extends ExtractionResult | ValidationResult>(
    raw: string,
    repairFn: (raw: string) => Promise<string>,
  ): Promise<T> {
    try {
      return extractJson(raw) as T;
    } catch {
      // Retry with LLM repair prompt
      const repaired = await repairFn(raw);
      return extractJson(repaired) as T;
    }
  }
}
