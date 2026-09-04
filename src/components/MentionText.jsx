import React from 'react';
import { Text } from 'react-native';

const MENTION_REGEX = /@([a-zA-Z0-9_]{2,30})/g;

export default function MentionText({ text, style, mentionStyle, onMentionPress }) {
  if (!text) return null;

  const parts = [];
  const re = new RegExp(MENTION_REGEX.source, 'g');
  let last = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) });
    }
    parts.push({ type: 'mention', value: match[0], username: match[1] });
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) });
  }

  if (parts.length === 0) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.type === 'mention' ? (
          <Text
            key={i}
            style={mentionStyle}
            onPress={onMentionPress ? () => onMentionPress(part.username) : undefined}
            suppressHighlighting={!onMentionPress}
          >
            {part.value}
          </Text>
        ) : (
          <Text key={i}>{part.value}</Text>
        ),
      )}
    </Text>
  );
}
