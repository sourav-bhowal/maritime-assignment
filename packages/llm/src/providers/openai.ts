import OpenAI from "openai";
import { BaseLLMProvider } from "./provider.js";
import type {
  LLMProvider,
  ExtractionResult,
  ValidationResult,
} from "../types.js";
import {
  EXTRACTION_PROMPT,
  buildValidationPrompt,
  buildRepairPrompt,
} from "../prompts.js";

/**
 * OpenAI provider for LLM that extends BaseLLMProvider and implements LLMProvider
 */
export class OpenAIProvider extends BaseLLMProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  /**
   * Constructor for OpenAIProvider
   */
  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.LLM_API_KEY!,
    });
    this.model = process.env.LLM_MODEL || "gpt-4o-mini";
  }

  /**
   * Extract data from an image using OpenAI
   * @param fileBuffer - Buffer containing the image data
   * @param mimeType - MIME type of the image
   * @param fileName - Name of the file
   * @returns Promise resolving to ExtractionResult
   */
  async extract(
    fileBuffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<ExtractionResult> {
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await this.withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
              {
                type: "text",
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("LLM returned no text content");
    }

    const parsed = await this.safeParse<ExtractionResult>(raw, (bad) =>
      this.repairJson(bad),
    );

    // Retry once if LOW confidence
    if (parsed?.detection?.confidence === "LOW") {
      return this.retryWithHint(fileBuffer, mimeType, fileName);
    }

    return parsed;
  }

  /**
   * Validate extractions using OpenAI
   * @param extractions - Array of ExtractionResult objects
   * @returns Promise resolving to ValidationResult
   */
  async validate(extractions: ExtractionResult[]): Promise<ValidationResult> {
    const prompt = buildValidationPrompt(extractions);

    const response = await this.withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
          },
        ],
      }),
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("LLM returned no text content");
    }

    return this.safeParse<ValidationResult>(raw, (bad) =>
      this.repairJson(bad),
    );
  }

  /**
   * Repair JSON using OpenAI
   * @param bad - Malformed JSON string
   * @returns Promise resolving to repaired JSON string
   */
  private async repairJson(bad: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildRepairPrompt(bad) }],
        },
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }

  /**
   * Retry extraction with additional hints
   * @param buffer - Buffer containing the image data
   * @param mime - MIME type of the image
   * @param name - Name of the file
   * @returns Promise resolving to ExtractionResult
   */
  private async retryWithHint(
    buffer: Buffer,
    mime: string,
    name: string,
  ): Promise<ExtractionResult> {
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    const response = await this.withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
              {
                type: "text",
                text: `${EXTRACTION_PROMPT}\n\nAdditional hints — File name: "${name}", MIME type: "${mime}". Use these to improve detection accuracy.`,
              },
            ],
          },
        ],
      }),
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("LLM retry returned no text content");
    }

    return this.safeParse<ExtractionResult>(raw, (bad) =>
      this.repairJson(bad),
    );
  }
}
