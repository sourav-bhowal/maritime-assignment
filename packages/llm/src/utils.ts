/**
 * Extract JSON from the raw string.
 * @param raw - Raw string to extract JSON from.
 * @returns JSON object.
 */
export function extractJson(raw: string): any {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error("No JSON found");
    }

    const jsonString = raw.slice(start, end + 1);
    return JSON.parse(jsonString);
  } catch (err) {
    throw new Error("JSON_PARSE_FAILED");
  }
}
