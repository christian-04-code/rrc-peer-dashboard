import { createHash } from "node:crypto";
import { withBoundedRetry, type RetryConfig } from "@/lib/news/ai/retry";

/**
 * Phase 7D artifact storage abstraction (Section 18), extended in Phase 7E
 * with a real read path (`get()`) now that a real publish/download flow
 * exists to need one. Same provider-interface + safe-default pattern as
 * ai/provider.ts and render/pdf-renderer.ts.
 *
 * `key`'s exact meaning is provider-defined -- it is whatever opaque string
 * a given provider's own `get()` needs to resolve the same bytes back later,
 * not necessarily the caller-supplied pathname passed into `put()`. For
 * `InMemoryArtifactStore` that's the literal map key (the caller's own
 * pathname, unchanged). For `VercelBlobArtifactStore` it is the blob's own
 * URL that `put()` returns. This is what `lib/reports/publish-service.ts`
 * persists as `weekly_report_snapshots.artifact_key` at publish time, and
 * what the `/api/reports/latest/download` route reads back at download
 * time -- no schema change was needed for this (that column was always a
 * provider-agnostic string, see schema.sql's own comment).
 *
 * The project's Blob store is PRIVATE (an intentional architecture
 * decision -- the report artifact must never be reachable by a bare,
 * unauthenticated URL; only this application's own server-side code, via
 * BLOB_READ_WRITE_TOKEN, may read it, and only `/api/reports/latest/download`
 * ever exposes the bytes, to the browser, over its own route). Confirmed
 * against the installed @vercel/blob v2.8.0 API
 * (node_modules/@vercel/blob/dist/index.d.ts) before writing this: `put()`
 * takes `access: "public" | "private"` (previously hard-coded to "public"
 * here, which is exactly what a private store rejects with "Cannot use
 * public access on a private store"), and the SDK exports its own `get()`
 * function -- distinct from a plain `fetch()` -- that authenticates with
 * the same token and works for a URL OR a pathname:
 * `get(urlOrPathname, { access: "private", token })` -> `{ stream, blob }`,
 * or `null` if not found (never throws for plain not-found, matching this
 * file's own `ArtifactStorageProvider.get()` contract already). A private
 * blob's `put()`-returned `url` is still the right value to persist and
 * pass back into `get()` -- it simply cannot be fetched with a bare,
 * unauthenticated `fetch()` any more, which `get()` is what now performs
 * server-side instead.
 */

export type ArtifactPutResult = {
  key: string;
  checksum: string;
  sizeBytes: number;
  contentType: string;
};

export class ArtifactStorageError extends Error {}

export interface ArtifactStorageProvider {
  put(key: string, buffer: Buffer, contentType: string): Promise<ArtifactPutResult>;
  /** Returns the stored bytes for a key previously returned by `put()`'s own `ArtifactPutResult.key`, or `null` if nothing is stored there (never throws for a plain "not found" -- callers distinguish "unavailable" from "the store itself errored"). */
  get(key: string): Promise<Buffer | null>;
}

export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * A real Preview download reproduced this exact intermittent failure: 5
 * back-to-back requests for the SAME already-published artifact returned
 * 503/200/200/503/503 -- while the sibling status endpoint (same DB pool,
 * no Blob access) succeeded 8/8 in the same session, isolating the
 * flakiness to the Blob read itself rather than the DB or the route. The
 * downloaded bytes were byte-identical and valid (%PDF-, 162076 bytes)
 * every time the read succeeded, confirming the stored object itself is
 * intact -- this is a transient read failure (consistent with a cold
 * function instance or a brief origin hiccup), not a missing/corrupt
 * artifact, so a bounded retry (the same pattern already used for the
 * Anthropic call, lib/news/ai/retry.ts) is the correct fix rather than
 * any kind of regeneration or republish.
 */
const BLOB_GET_RETRY_CONFIG: RetryConfig = { maxAttempts: 3, baseDelayMs: 250 };

/** Test/dev double -- stores buffers in a plain Map, no real I/O. Also usable as a local-development fallback when BLOB_READ_WRITE_TOKEN isn't configured. */
export class InMemoryArtifactStore implements ArtifactStorageProvider {
  private readonly store = new Map<string, Buffer>();

  async put(key: string, buffer: Buffer, contentType: string): Promise<ArtifactPutResult> {
    this.store.set(key, buffer);
    return { key, checksum: computeChecksum(buffer), sizeBytes: buffer.byteLength, contentType };
  }

  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key) ?? null;
  }
}

/**
 * Real implementation, gated on BLOB_READ_WRITE_TOKEN exactly like
 * AnthropicWeeklyAnalystProvider is gated on ANTHROPIC_API_KEY -- constructing
 * this without the token throws immediately rather than failing later at an
 * unexpected call site. Lazy-imports `@vercel/blob` for the same reason
 * pdf-renderer.ts lazy-imports puppeteer-core/@sparticuz/chromium: a test run
 * that never constructs this class should never need the real package loaded.
 */
export class VercelBlobArtifactStore implements ArtifactStorageProvider {
  private readonly token: string;

  constructor(options: { token?: string } = {}) {
    const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new ArtifactStorageError("BLOB_READ_WRITE_TOKEN is not set. Add it before constructing VercelBlobArtifactStore.");
    }
    this.token = token;
  }

  /** `key` here is the desired blob pathname (e.g. "reports/weekly/2026-08-28.pdf") -- the RETURNED ArtifactPutResult.key is the blob URL Vercel assigned it, which is what get() and the DB's own artifact_key column must use afterward (see this file's header). */
  async put(key: string, buffer: Buffer, contentType: string): Promise<ArtifactPutResult> {
    const { put } = await import("@vercel/blob");
    const checksum = computeChecksum(buffer);
    const result = await put(key, buffer, { access: "private", contentType, token: this.token, addRandomSuffix: false });
    if (!result.url) throw new ArtifactStorageError("Vercel Blob upload did not return a URL.");
    return { key: result.url, checksum, sizeBytes: buffer.byteLength, contentType };
  }

  /**
   * `key` must be a blob URL previously returned by this class's own put().
   * A private blob is not fetchable with a bare `fetch()` -- reads must go
   * through the SDK's own `get()`, which authenticates with the same
   * read-write token, so the bytes never pass through anything but this
   * server-side code. Wrapped in a short bounded retry: a real Preview
   * download reproduced this exact read intermittently failing (503) on a
   * majority of back-to-back requests for the same, already-verified-intact
   * artifact (see BLOB_GET_RETRY_CONFIG's own comment) -- a plain, side-
   * effect-free read is safe to retry outright, and this is the same
   * pattern already used for the Anthropic call rather than a new mechanism.
   */
  async get(key: string): Promise<Buffer | null> {
    return withBoundedRetry(async () => {
      const { get } = await import("@vercel/blob");
      let result: Awaited<ReturnType<typeof get>>;
      try {
        result = await get(key, { access: "private", token: this.token });
      } catch (error) {
        throw new ArtifactStorageError(`Vercel Blob fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      if (!result || !result.stream) return null;
      const reader = result.stream.getReader();
      const chunks: Buffer[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    }, BLOB_GET_RETRY_CONFIG);
  }
}
