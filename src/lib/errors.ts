export function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  // Anything reaching here already failed the `object`/`message` check
  // above, so it can never be an `Error` instance (all `Error`s are
  // objects with a string `message`). Fall back to a plain string
  // conversion for primitives (strings, numbers, etc.) thrown as errors.
  return String(error);
}
