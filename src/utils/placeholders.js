export function getPlaceholderUrl(seed) {
  const safeSeed = seed ? encodeURIComponent(seed) : 'Cupid';
  return `https://api.dicebear.com/10.x/toon-head/png?seed=${safeSeed}&size=200`;
}
