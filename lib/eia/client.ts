export function getEiaApiKey(): string {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    throw new Error(
      "EIA_API_KEY is not set. Add it to .env.local before calling the EIA client."
    );
  }
  return key;
}
