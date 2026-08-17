// Spark templates — casual interest signals (not a heavy "match" pressure)


export const SPARK_ICON = 'flash-sharp';

export const SPARK_TEMPLATES = [
  {
    id: 'same_vibe',
    label: 'Same vibe',
    icon: 'sparkles',
    color: '#F9C22E',
    preview: 'We seem on the same wavelength',
    notificationTitle: 'Spark: Same vibe',
  },
  {
    id: 'seem_cool',
    label: 'You seem cool',
    icon: 'thumbs-up',
    color: '#20C997',
    preview: 'You seem really cool — wanted to say hi',
    notificationTitle: 'Spark: You seem cool',
  },
  {
    id: 'match_vibe',
    label: 'Match my vibe',
    icon: 'flash-sharp',
    color: '#FF4D6D',
    preview: 'Your vibe matches what I am looking for',
    notificationTitle: 'Spark: Match my vibe',
  },
  {
    id: 'study_buddy',
    label: 'Study buddy?',
    icon: 'book',
    color: '#7B61FF',
    preview: 'Want to be study buddies?',
    notificationTitle: 'Spark: Study buddy',
  },
  {
    id: 'game_later',
    label: 'Game later?',
    icon: 'game-controller',
    color: '#00F0FF',
    preview: 'Down to game together sometime?',
    notificationTitle: 'Spark: Game later',
  },
  {
    id: 'lets_chat',
    label: "Let's chat",
    icon: 'chatbubbles',
    color: '#FF9F1C',
    preview: 'Would love to chat sometime',
    notificationTitle: "Spark: Let's chat",
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: 'create',
    color: '#C77DFF',
    preview: '',
    notificationTitle: 'Spark for you',
    allowsCustom: true,
  },
];

export function getSparkTemplate(sparkType) {
  return SPARK_TEMPLATES.find((t) => t.id === sparkType) ?? SPARK_TEMPLATES[1];
}

export function sparkMessageForType(sparkType, customMessage) {
  const t = getSparkTemplate(sparkType);
  if (sparkType === 'custom' && customMessage?.trim()) {
    return customMessage.trim();
  }
  return t.preview;
}
