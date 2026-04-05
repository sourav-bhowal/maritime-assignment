import Anthropic from "@anthropic-ai/sdk";
import { BaseLLMProvider } from "./provider.js";
import type { LLMProvider, ExtractionResult, ValidationResult } from "../types.js";
import { EXTRACTION_PROMPT, buildValidationPrompt, buildRepairPrompt } from "../prompts.js";

/**
 * Media types supported by Anthropic
 */

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Claude provider for LLM that extends BaseLLMProvider and implements LLMProvider
 */
export class ClaudeProvider extends BaseLLMProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  /**
   * Constructor for ClaudeProvider
   */
  constructor() {
    super();
    this.client = new Anthropic({
      apiKey: process.env.LLM_API_KEY!,
    });
    this.model = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";
  }

  /**
   * Extract data from an image using Claude
   * @param fileBuffer - Buffer containing the image data
   * @param mimeType - MIME type of the image
   * @param fileName - Name of the file
   * @returns Promise resolving to ExtractionResult
   */
  async extract(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<ExtractionResult> {
    console.log("[ClaudeProvider] Starting extraction for file:", fileName);
    const base64 = fileBuffer.toString("base64");

    const response = await this.withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as AnthropicMediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      })
    );

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("LLM returned no text content");
    }
    const raw = textBlock.text;

    const parsed = await this.safeParse<ExtractionResult>(raw, (bad) => this.repairJson(bad));

    // Retry once if LOW confidence — include file hints
    if (parsed?.detection?.confidence === "LOW") {
      return this.retryWithHint(fileBuffer, mimeType, fileName);
    }

    return parsed;
  }

  /**
   * Validate extractions using Claude
   * @param extractions - Array of ExtractionResult objects
   * @returns Promise resolving to ValidationResult
   */
  async validate(extractions: ExtractionResult[]): Promise<ValidationResult> {
    const prompt = buildValidationPrompt(extractions);

    const response = await this.withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
          },
        ],
      })
    );

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("LLM returned no text content");
    }

    return this.safeParse<ValidationResult>(textBlock.text, (bad) => this.repairJson(bad));
  }

  /**
   * Repair JSON using Claude
   * @param bad - Malformed JSON string
   * @returns Promise resolving to repaired JSON string
   */
  private async repairJson(bad: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildRepairPrompt(bad) }],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("LLM repair returned no text content");
    }
    return textBlock.text;
  }

  /**
   * Retry extraction with additional hints
   * @param buffer - Buffer containing the image data
   * @param mime - MIME type of the image
   * @param name - Name of the file
   * @returns Promise resolving to ExtractionResult
   */
  private async retryWithHint(buffer: Buffer, mime: string, name: string): Promise<ExtractionResult> {
    const base64 = buffer.toString("base64");

    const response = await this.withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime as AnthropicMediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: `${EXTRACTION_PROMPT}\n\nAdditional hints — File name: "${name}", MIME type: "${mime}". Use these to improve detection accuracy.`,
              },
            ],
          },
        ],
      })
    );

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("LLM retry returned no text content");
    }

    return this.safeParse<ExtractionResult>(textBlock.text, (bad) => this.repairJson(bad));
  }
}
