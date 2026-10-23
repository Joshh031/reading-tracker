import {jsonModel} from '../server/providers.js';
// Temporary authenticated preview verification. Never enabled in production and
// never claims persistence. Requires a separately scoped, expiring test key.
import { authenticate, safeOrigin } from "../server/auth.js";
import { resolveEpisode } from "../server/identity.js";
import { discoverTranscript } from "../server/transcript.js";
import { analyzeEpisode, indexReview } from "../server/analysis.js";
import { problem, VaultError } from "../server/errors.js";
export const config = { maxDuration: 300 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.KV_LIVE_VERIFICATION_ENABLED !== "true"
  )
    return res.status(404).end();
  if (req.method !== "POST") return res.status(405).end();
  try {
    safeOrigin(req);
    await authenticate(req, "diagnostics");
    if(req.body?.probe===true){const result=await jsonModel('Return JSON {"ok":true}.',{}, {maxTokens:30});return res.json({verificationOnly:true,persisted:false,model:result.model,result:result.data});}
    const e = await resolveEpisode(req.body?.url),
      result = await discoverTranscript(e);
    if (!result.transcript)
      return res.json({
        verificationOnly: true,
        persisted: false,
        episode: e,
        transcript: null,
        attempts: result.attempts,
      });
    const review =
      req.body?.analyze === true
        ? await analyzeEpisode(e, result.transcript)
        : null;
    const searchIndex = review ? await indexReview(review) : null;
    const { segments, ...transcript } = result.transcript;
    return res.json({
      verificationOnly: true,
      persisted: false,
      episode: e,
      transcript,
      review,
      indexedClaims: searchIndex?.length || 0,
      attempts: result.attempts,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: problem(error) });
  }
}
