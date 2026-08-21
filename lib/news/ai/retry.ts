/**
 * Bounded retry for one article's analysis call. Retries on ANY thrown
 * error, including AiAnalysisValidationError -- a malformed/invalid tool
 * response is exactly the case Section 4 says must be retried (bounded),
 * not immediately given up on, since a fresh sample from the model may
 * simply come back valid. Network/provider errors retry for the same
 * reason. maxAttempts caps the damage either way.
 */
export type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
};

export const DEFAULT_ANALYSIS_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 400
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withBoundedRetry<T>(fn: () => Promise<T>, config: RetryConfig = DEFAULT_ANALYSIS_RETRY_CONFIG): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < config.maxAttempts) {
        await delay(config.baseDelayMs * attempt);
      }
    }
  }
  throw lastError;
}
