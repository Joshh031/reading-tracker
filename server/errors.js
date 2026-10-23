export class VaultError extends Error {
  constructor(code, message, status = 422, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
export const problem = (error) => ({
  code: error.code || "PROCESSING_FAILED",
  message:
    error instanceof VaultError
      ? error.message
      : "Processing failed. Retry or inspect server logs.",
  retryable: Boolean(error.retryable),
});
