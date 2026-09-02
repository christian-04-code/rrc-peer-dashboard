import { createHash } from "node:crypto";

/**
 * Phase 7D artifact storage abstraction (Section 18). Same provider-
 * interface + safe-default pattern as ai/provider.ts and render/pdf-renderer.ts.
 * Nothing in this subsystem calls `put()` yet -- Section 18 is explicit that
 * actual publication (wiring this into the snapshot repo's own publish
 * transition) belongs to Phase 7E+; this file only makes the abstraction and
 * one real implementation available for that later phase to use, and gives
 * weekly-report-pdf-service.ts's tests an in-memory fake so they never need
 * live Vercel Blob.
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
}

export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Test/dev double -- stores buffers in a plain Map, no real I/O. Also usable as a local-development fallback when BLOB_READ_WRITE_TOKEN isn't configured, though nothing wires it in for that purpose yet (no publish flow exists yet -- see this file's header). */
export class InMemoryArtifactStore implements ArtifactStorageProvider {
  private readonly store = new Map<string, Buffer>();

  async put(key: string, buffer: Buffer, contentType: string): Promise<ArtifactPutResult> {
    this.store.set(key, buffer);
    return { key, checksum: computeChecksum(buffer), sizeBytes: buffer.byteLength, contentType };
  }

  get(key: string): Buffer | undefined {
    return this.store.get(key);
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

  async put(key: string, buffer: Buffer, contentType: string): Promise<ArtifactPutResult> {
    const { put } = await import("@vercel/blob");
    const checksum = computeChecksum(buffer);
    const result = await put(key, buffer, { access: "public", contentType, token: this.token, addRandomSuffix: false });
    if (!result.url) throw new ArtifactStorageError("Vercel Blob upload did not return a URL.");
    return { key, checksum, sizeBytes: buffer.byteLength, contentType };
  }
}
