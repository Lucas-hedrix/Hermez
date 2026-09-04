/**
 * Truth or Dare prompts — bundled locally for offline / zero-latency play.
 * Curated for a dating/friendship app context (light, fun, not overly intimate).
 */


export const TRUTH_PROMPTS = [
  // Light / Icebreaker
  "What's your go-to comfort food after a long day?",
  "If you could teleport anywhere right now for dinner, where would it be?",
  "What's a hobby you'd start if you had unlimited time and money?",
  "What's the best piece of advice you've ever received?",
  "If you could master any skill instantly, what would it be?",
  "What's your favorite way to spend a Sunday?",
  "What's a movie or show you can re-watch endlessly?",
  "If you could have dinner with any three people (dead or alive), who?",
  "What's the most spontaneous thing you've ever done?",
  "What's a small thing that instantly makes your day better?",

  // Slightly deeper
  "What's a belief you held strongly but later changed your mind about?",
  "What's something you're proud of that most people don't know?",
  "If you could relive one day of your life, which would it be?",
  "What's a fear you've overcome (or are working on)?",
  "What does your ideal relationship dynamic look like?",
  "What's a deal-breaker for you in a friendship or relationship?",
  "What's the most meaningful compliment you've ever received?",
  "If you could give your 18-year-old self one piece of advice, what would it be?",
  "What's something you wish more people asked you about?",
  "What's a value you refuse to compromise on?",

  // Playful / Flirty
  "What's your love language — words, time, gifts, acts, or touch?",
  "What's the first thing you notice about someone you're attracted to?",
  "What's your idea of a perfect first date?",
  "Have you ever had a crush on a fictional character? Who?",
  "What's a guilty pleasure you're not actually guilty about?",
  "If we were on a date right now, what would you order for me?",
  "What's the cheesiest pickup line that actually worked on you?",
  "What's your 'green flag' in a partner?",
  "Beach vacation or mountain cabin?",
  "Cook together or order takeout?",

  // Would-you-rather style truths
  "Would you rather always be 10 minutes early or 10 minutes late?",
  "Would you rather have unlimited money or unlimited time?",
  "Would you rather be famous for your talent or your kindness?",
  "Would you rather read minds or see the future?",
  "Would you rather lose all your photos or all your messages?",
];

export const DARE_PROMPTS = [
  // Text / Chat based (doable in-app)
  "Send the other player a voice note singing 10 seconds of your favorite song.",
  "Share your screen (or describe) your most used emoji and explain why.",
  "Text the other player a terrible joke right now.",
  "Send a photo of something within arm's reach that has a story behind it.",
  "Change your chat theme to something ridiculous for the next 5 minutes.",
  "Write a 2-line poem about the other player and send it.",
  "Send a voice note doing your best celebrity impression.",
  "Share the last photo you took (that's safe for chat).",
  "Type a message using only emojis — the other player has to guess it.",
  "Send the other player a 'would you rather' question of your own.",

  // Social / Playful
  "Post an Instagram/TikTok story tagging the other player (or pretend you did).",
  "Send a voice note saying three things you like about the other player.",
  "Give the other player a ridiculous nickname for the rest of this game.",
  "Share your most controversial food opinion (pineapple on pizza, etc.).",
  "Send a GIF/meme that represents your current mood.",
  "Text the other player a 'fake fact' and see if they believe it.",
  "Describe your perfect day using only three emojis.",
  "Send the other player a song recommendation they *must* listen to.",
  "Tell the other player a 'two truths and a lie' — they guess the lie.",
  "Send a voice note reading the last text you received in a dramatic voice.",

  // Light challenges
  "Do your best 'accent' in a voice note (any accent).",
  "Send a photo of your current view (window, desk, etc.).",
  "Make up a 10-second commercial for an imaginary product and send it as a voice note.",
  "Send the other player the 3rd photo in your camera roll (or describe it).",
  "Write a haiku about dating apps and send it.",
];

/**
 * Returns a random truth prompt.
 */
export function getRandomTruth() {
  const idx = Math.floor(Math.random() * TRUTH_PROMPTS.length);
  return TRUTH_PROMPTS[idx];
}

/**
 * Returns a random dare prompt.
 */
export function getRandomDare() {
  const idx = Math.floor(Math.random() * DARE_PROMPTS.length);
  return DARE_PROMPTS[idx];
}

/**
 * Returns a random prompt of the given type ('truth' | 'dare').
 */
export function getRandomPrompt(type) {
  return type === 'truth' ? getRandomTruth() : getRandomDare();
}

/**
 * Activity type constant.
 */
export const ACTIVITY_TYPE_TRUTH_OR_DARE = 'truth_or_dare';