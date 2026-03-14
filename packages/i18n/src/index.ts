const translations: Record<string, Record<string, string>> = {
  en: {
    pairing_required: "You need a pairing code to use Sandra. Send /pair <code>.",
    task_created: 'Task created: "{title}"',
    reminder_sent: "Reminder: {title}",
    user_blocked: "You are not authorized to use Sandra.",
    research_error: "I couldn't complete that research. Please try again.",
  },
  hi: {
    pairing_required: "Sandra का उपयोग करने के लिए pairing code चाहिए। /pair <code> भेजें।",
    task_created: 'Task बनाया गया: "{title}"',
    reminder_sent: "याद दिलाना: {title}",
    user_blocked: "आप Sandra का उपयोग करने के लिए अधिकृत नहीं हैं।",
    research_error: "वह research पूरी नहीं हो सकी। कृपया पुनः प्रयास करें।",
  },
};

export function t(
  locale: string,
  key: string,
  vars: Record<string, string> = {}
): string {
  const dict = translations[locale] ?? translations["en"] ?? {};
  let result = dict[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{${k}}`, v);
  }
  return result;
}

export function getSupportedLocales(): string[] {
  return Object.keys(translations);
}
