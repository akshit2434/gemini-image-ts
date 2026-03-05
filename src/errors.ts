/**
 * Authentication error — invalid or expired cookies.
 */
export class AuthError extends Error {
  constructor(message = "Authentication failed. Check your cookie values.") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * API-level error — bad response, parsing failure, etc.
 */
export class APIError extends Error {
  constructor(message = "API request failed.") {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Request timed out.
 */
export class TimeoutError extends Error {
  constructor(message = "Request timed out.") {
    super(message);
    this.name = "TimeoutError";
  }
}
