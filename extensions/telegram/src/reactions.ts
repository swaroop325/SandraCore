/** Status reaction emojis — sent as replies to give processing feedback */
export const STATUS_REACTIONS = {
  thinking:  "🤔",
  researching: "🔍",
  working:   "⚙️",
  done:      "✅",
  error:     "❌",
  reminder:  "⏰",
} as const;

export type StatusReaction = keyof typeof STATUS_REACTIONS;

/**
 * Format a status message with the appropriate emoji prefix.
 */
export function withStatus(status: StatusReaction, message: string): string {
  return `${STATUS_REACTIONS[status]} ${message}`;
}
