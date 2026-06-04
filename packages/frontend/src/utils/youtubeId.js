/** YouTube video IDs are exactly 11 chars from this alphabet. */
const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function safeYoutubeId(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return YT_ID_RE.test(trimmed) ? trimmed : null;
}
