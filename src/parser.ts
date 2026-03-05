import type { GeneratedImage, GenerateResult, WebImage } from "./types.js";

/**
 * Safely navigate a deeply nested structure (arrays/objects) using a path
 * of indices and keys. Returns `defaultValue` if the path is invalid.
 */
export function getNestedValue(
  data: unknown,
  path: (number | string)[],
  defaultValue: unknown = undefined
): unknown {
  let current: unknown = data;

  for (const key of path) {
    if (current == null) return defaultValue;

    if (typeof key === "number" && Array.isArray(current)) {
      if (key < 0 || key >= current.length) return defaultValue;
      current = current[key];
    } else if (
      typeof key === "string" &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }

  return current ?? defaultValue;
}

/**
 * Parse Google's length-prefixed framing protocol.
 *
 * Each frame has the format: `<length>\n<json_payload>\n`
 * The length is in UTF-16 code units (JavaScript string length).
 *
 * Returns an array of parsed JSON envelopes.
 */
export function parseFramedResponse(raw: string): unknown[] {
  let content = raw;

  // Strip the XSSI protection prefix
  if (content.startsWith(")]}'")) {
    content = content.slice(4);
  }
  content = content.trimStart();

  const lengthPattern = /(\d+)\n/;
  const parsed: unknown[] = [];
  let pos = 0;

  while (pos < content.length) {
    // Skip whitespace
    while (pos < content.length && /\s/.test(content[pos])) {
      pos++;
    }
    if (pos >= content.length) break;

    // Match the length marker
    const remaining = content.slice(pos);
    const match = remaining.match(lengthPattern);
    if (!match || match.index !== 0) break;

    const lengthStr = match[1];
    const length = parseInt(lengthStr, 10);

    // Content starts right after the digits (the \n is counted in the length)
    const contentStart = pos + lengthStr.length;

    // Check if we have enough content (length is in JS string length units)
    if (contentStart + length > content.length) break;

    const chunk = content.slice(contentStart, contentStart + length).trim();
    pos = contentStart + length;

    if (!chunk) continue;

    try {
      const result = JSON.parse(chunk);
      if (Array.isArray(result)) {
        parsed.push(...result);
      } else {
        parsed.push(result);
      }
    } catch {
      // Skip unparseable chunks
    }
  }

  // If framing protocol didn't work, try parsing the whole thing
  if (parsed.length === 0 && content.trim()) {
    try {
      const result = JSON.parse(content.trim());
      if (Array.isArray(result)) {
        return result;
      }
      return [result];
    } catch {
      // Fall through
    }
  }

  return parsed;
}

/**
 * Extract generated images, web images, and text from parsed response envelopes.
 */
export function extractResult(envelopes: unknown[]): GenerateResult {
  const result: GenerateResult = {
    text: "",
    generatedImages: [],
    webImages: [],
  };

  for (const part of envelopes) {
    // The actual data is double-encoded: part[2] contains a JSON string
    const innerJsonStr = getNestedValue(part, [2]) as string | undefined;
    if (!innerJsonStr || typeof innerJsonStr !== "string") continue;

    let partJson: unknown;
    try {
      partJson = JSON.parse(innerJsonStr);
    } catch {
      continue;
    }

    // Candidates list is at partJson[4]
    const candidatesList = getNestedValue(partJson, [4], []) as unknown[];
    if (!Array.isArray(candidatesList) || candidatesList.length === 0) continue;

    for (const candidate of candidatesList) {
      const rcid = getNestedValue(candidate, [0]) as string | undefined;
      if (!rcid) continue;

      // Text at candidate[1][0]
      let text = (getNestedValue(candidate, [1, 0], "") as string) || "";

      // Clean up googleusercontent artifacts
      text = text.replace(
        /http:\/\/googleusercontent\.com\/\w+\/\d+\n*/g,
        ""
      );

      if (text && !result.text) {
        result.text = text;
      }

      // Web images at candidate[12][1]
      const webImagesData = getNestedValue(candidate, [12, 1], []) as unknown[];
      if (Array.isArray(webImagesData)) {
        for (const webImgData of webImagesData) {
          const url = getNestedValue(webImgData, [0, 0, 0]) as
            | string
            | undefined;
          if (url) {
            result.webImages.push({
              url,
              title: (getNestedValue(webImgData, [7, 0], "") as string) || "",
              alt: (getNestedValue(webImgData, [0, 4], "") as string) || "",
            });
          }
        }
      }

      // Generated images at candidate[12][7][0]
      const genImagesData = getNestedValue(
        candidate,
        [12, 7, 0],
        []
      ) as unknown[];
      if (Array.isArray(genImagesData)) {
        for (const genImgData of genImagesData) {
          const url = getNestedValue(genImgData, [0, 3, 3]) as
            | string
            | undefined;
          if (url) {
            const imgNum = getNestedValue(genImgData, [3, 6]) as
              | number
              | undefined;
            result.generatedImages.push({
              // Append =s2048 for full resolution
              url: `${url}=s2048`,
              title: imgNum
                ? `[Generated Image ${imgNum}]`
                : "[Generated Image]",
              alt:
                (getNestedValue(genImgData, [3, 5, 0], "") as string) || "",
            });
          }
        }
      }
    }
  }

  return result;
}
