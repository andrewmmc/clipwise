/** Quote a token for shell preview if it contains whitespace or shell metacharacters. */
export function shellQuote(token: string): string {
  if (token === "") return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

export function buildCommandPreview(command: string, args: string[]): string {
  const trimmedCommand = command.trim();
  const cleanArgs = args.map((a) => a.trim()).filter((a) => a.length > 0);
  const parts: string[] = [];
  if (trimmedCommand) parts.push(trimmedCommand);
  parts.push(...cleanArgs.map(shellQuote));
  parts.push(shellQuote("<your prompt>"));
  return parts.join(" ");
}
