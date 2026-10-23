import { sleep } from "workflow";

// No archive access, providers, or user data. Used only by scoped preview diagnostics.
export async function verifyDurableWorker() {
  "use workflow";
  console.log("vault_workflow_verification_started");
  await sleep("3s");
  return { ok: true, resumedAfterDurableSleep: true };
}
