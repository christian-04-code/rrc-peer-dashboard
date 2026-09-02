import { createHash } from "node:crypto";

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
 * real public URL that `put()` returns -- Vercel Blob has no separate
 * "look up by pathname" API that doesn't already require knowing that URL
 * (or listing by prefix), so treating the URL itself as the key lets `get()`
 * be a plain, direct fetch. This is what `lib/reports/publish-service.ts`
 * persists as `weekly_report_snapshots.artifact_key` at publish time, and
 * what the `/api/reports/latest/download` route reads back at download
 * time -- no schema change was needed for this (that column was always a
 * provider-agnostic string, see schema.sql's own comment).
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

  /** `key` here is the desired blob pathname (e.g. "reports/weekly/2026-08-28.pdf") -- the RETURNED ArtifactPutResult.key is the real blob URL Vercel assigned it, which is what get() and the DB's own artifact_key column must use afterward (see this file's header). */
  async put(key: string, buffer: Buffer, contentType: string): Promise<ArtifactPutResult> {
    const { put } = await import("@vercel/blob");
    const checksum = computeChecksum(buffer);
    const result = await put(key, buffer, { access: "public", contentType, token: this.token, addRandomSuffix: false });
    if (!result.url) throw new ArtifactStorageError("Vercel Blob upload did not return a URL.");
    return { key: result.url, checksum, sizeBytes: buffer.byteLength, contentType };
  }

  /** `key` must be a real blob URL previously returned by this class's own put() -- a plain HTTP fetch, since Vercel Blob's public URLs are directly fetchable with no SDK call needed for a read. */
  async get(key: string): Promise<Buffer | null> {
    let response: Response;
    try {
      response = await fetch(key);
    } catch (error) {
      throw new ArtifactStorageError(`Vercel Blob fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new ArtifactStorageError(`Vercel Blob fetch returned HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }
}
