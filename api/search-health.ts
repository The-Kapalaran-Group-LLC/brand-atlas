export default async function handler(_req: any, res: any) {
  const hasGoogleKey = Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim());
  const hasGoogleEngineId = Boolean(
    process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || process.env.GOOGLE_CSE_CX?.trim()
  );
  const hasBingKey = Boolean(process.env.BING_SEARCH_KEY?.trim());

  const provider = hasGoogleKey && hasGoogleEngineId ? 'google' : hasBingKey ? 'bing' : 'none';

  res.status(200).json({
    ok: provider !== 'none',
    provider,
    env: {
      GOOGLE_SEARCH_API_KEY: hasGoogleKey,
      GOOGLE_SEARCH_ENGINE_ID_OR_CX: hasGoogleEngineId,
      BING_SEARCH_KEY: hasBingKey,
    },
  });
}
