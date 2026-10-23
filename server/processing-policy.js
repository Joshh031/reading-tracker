import { VaultError } from "./errors.js";

// OIDC/API credentials alone never authorize paid model or transcription requests.
export const paidProcessingEnabled = () =>
  process.env.KV_PAID_PROCESSING_ENABLED === "true";
export function assertPaidProcessingEnabled() {
  if (!paidProcessingEnabled())
    throw new VaultError(
      "PAID_PROCESSING_DISABLED",
      "Paid processing is off. Use ChatGPT with the saved source material.",
      409,
    );
}
