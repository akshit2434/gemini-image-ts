import type { SessionTokens } from "./types.js";

/**
 * Build the URL query parameters for a generate request.
 */
export function buildQueryParams(
  reqId: number,
  tokens: SessionTokens
): Record<string, string> {
  const params: Record<string, string> = {
    _reqid: String(reqId),
    rt: "c",
  };

  if (tokens.buildLabel) {
    params.bl = tokens.buildLabel;
  }

  if (tokens.sessionId) {
    params["f.sid"] = tokens.sessionId;
  }

  return params;
}

/**
 * Build the POST body for a StreamGenerate request.
 *
 * The body is URL-encoded form data with two fields:
 *  - `at`: the SNlM0e access token
 *  - `f.req`: a double-JSON-encoded nested array structure
 *
 * The inner structure is a 69-element array where:
 *  - [0] = message content [prompt, 0, null, null, null, null, 0]
 *  - [2] = conversation metadata (empty for new conversations)
 *  - [7] = 1 (enables snapshot streaming)
 */
export function buildRequestBody(
  prompt: string,
  accessToken: string,
  fileData?: any[],
  metadata?: (string | null | number)[]
): string {
  // Message content payload
  const messageContent = [prompt, 0, null, fileData ?? null, null, null, 0];

  // 69-element inner request array
  const innerReqList: (unknown | null)[] = new Array(69).fill(null);
  innerReqList[0] = messageContent;
  // Conversation metadata
  innerReqList[2] = metadata ?? ["", "", "", null, null, null, null, null, null, ""];
  // Enable snapshot streaming
  innerReqList[7] = 1;

  // Double-encode: outer array wraps [null, JSON(innerReqList)]
  const fReq = JSON.stringify([null, JSON.stringify(innerReqList)]);

  // URL-encode the form body
  const body = new URLSearchParams({
    at: accessToken,
    "f.req": fReq,
  });

  return body.toString();
}
