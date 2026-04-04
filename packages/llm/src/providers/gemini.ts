import { GoogleGenAI } from "@google/genai";
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
 * Gemini provider for LLM that extends BaseLLMProvider and implements LLMProvider
 */
export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  private client: GoogleGenAI;
  private model: string;

  /**
   * Constructor for GeminiProvider
   */
  constructor() {
    super();
    this.client = new GoogleGenAI({
      apiKey: process.env.LLM_API_KEY!,
    });
    this.model = process.env.LLM_MODEL || "gemini-2.0-flash";
  }

  /**
   * Extract data from an image using Gemini
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

    const response = await this.withTimeout(
      this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64,
                },
              },
              {
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    );

    const raw = response.text ?? "";
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
   * Validate extractions using Gemini
   * @param extractions - Array of ExtractionResult objects
   * @returns Promise resolving to ValidationResult
   */
  async validate(extractions: ExtractionResult[]): Promise<ValidationResult> {
    const prompt = buildValidationPrompt(extractions);

    const response = await this.withTimeout(
      this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    );

    const raw = response.text ?? "";
    if (!raw) {
      throw new Error("LLM returned no text content");
    }

    return this.safeParse<ValidationResult>(raw, (bad) =>
      this.repairJson(bad),
    );
  }

  /**
   * Repair JSON using Gemini
   * @param bad - Malformed JSON string
   * @returns Promise resolving to repaired JSON string
   */
  private async repairJson(bad: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [{ text: buildRepairPrompt(bad) }],
        },
      ],
    });

    return response.text ?? "";
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

    const response = await this.withTimeout(
      this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mime,
                  data: base64,
                },
              },
              {
                text: `${EXTRACTION_PROMPT}\n\nAdditional hints — File name: "${name}", MIME type: "${mime}". Use these to improve detection accuracy.`,
              },
            ],
          },
        ],
      }),
    );

    const raw = response.text ?? "";
    if (!raw) {
      throw new Error("LLM retry returned no text content");
    }

    return this.safeParse<ExtractionResult>(raw, (bad) =>
      this.repairJson(bad),
    );
  }
}
