export function redact(value) {
  return String(value ?? '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\b(token|password|secret|authorization)=?[^&\s]*/gi, '$1=[redacted]')
    .slice(0, 2_000);
}
