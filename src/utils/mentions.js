const MENTION_REGEX = /@([a-zA-Z0-9_]{2,30})/g;

export function extractMentionUsernames(text) {
  if (!text) return [];
  const found = new Set();
  let match;
  const re = new RegExp(MENTION_REGEX.source, 'g');
  while ((match = re.exec(text)) !== null) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

export function getActiveMentionQuery(text, cursorIndex = text.length) {
  const before = text.slice(0, cursorIndex);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const chunk = before.slice(at + 1);
  if (/\s/.test(chunk)) return null;
  return { query: chunk, start: at };
}
