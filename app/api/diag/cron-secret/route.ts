import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY Phase 7F diagnostic route -- narrowly scoped to the single
 * question "why does /api/cron/reports return Unauthorized on Preview,"
 * gated by its own throwaway token (never CRON_SECRET), and returning only
 * non-reversible SHA-256 prefixes + lengths -- never the secret itself, in
 * either direction. Compare the fingerprints this route returns against
 * ones computed locally from the same inputs. MUST be removed before this
 * phase's checkpoint, same convention as the Phase 7D.1/7D.2 diagnostic
 * routes.
 */

const DIAG_TOKEN = "4424d0e1c084d64123935d9f184d0c8e335c95e7700b2e7c";

function fingerprint(value: string): { length: number; sha256_12: string } {
  return { length: value.length, sha256_12: createHash("sha256").update(value).digest("hex").slice(0, 12) };
}

export async function GET(request: Request) {
  if (request.headers.get("x-diag-token") !== DIAG_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    cronSecretPresent: Boolean(secret),
    cronSecretFingerprint: secret ? fingerprint(secret) : null,
    cronSecretTrimmedFingerprint: secret ? fingerprint(secret.trim()) : null,
    expectedBearerFingerprint: secret ? fingerprint(`Bearer ${secret}`) : null,
    authHeaderPresent: Boolean(authHeader),
    authHeaderFingerprint: authHeader ? fingerprint(authHeader) : null
  });
}
