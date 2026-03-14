const translations: Record<string, Record<string, string>> = {
  en: {
    pairing_required: "You need a pairing code to use Sandra. Send /pair <code>.",
    task_created: 'Task created: "{title}"',
    reminder_sent: "Reminder: {title}",
    user_blocked: "You are not authorized to use Sandra.",
    research_error: "I couldn't complete that research. Please try again.",
    voice_not_supported: "Sorry, I couldn't transcribe that voice message.",
    not_approved: "You are not yet approved. Contact the administrator for access.",
    error_retry: "Sorry, something went wrong. Please try again.",
    welcome: "Hello! I'm Sandra, your personal AI assistant. How can I help you today?",
    task_reminder: "Reminder: {task}",
    memory_saved: "I'll remember that.",
    session_expired: "Your session has expired. Please send a new message to continue.",
    processing: "Let me think about that...",
  },
  hi: {
    pairing_required: "Sandra का उपयोग करने के लिए pairing code चाहिए। /pair <code> भेजें।",
    task_created: 'Task बनाया गया: "{title}"',
    reminder_sent: "याद दिलाना: {title}",
    user_blocked: "आप Sandra का उपयोग करने के लिए अधिकृत नहीं हैं।",
    research_error: "वह research पूरी नहीं हो सकी। कृपया पुनः प्रयास करें।",
    voice_not_supported: "क्षमा करें, वह voice message transcribe नहीं हो सका।",
    not_approved: "आपको अभी तक अनुमति नहीं मिली है। एक्सेस के लिए व्यवस्थापक से संपर्क करें।",
    error_retry: "क्षमा करें, कुछ गलत हो गया। कृपया पुनः प्रयास करें।",
    welcome: "नमस्ते! मैं सैंड्रा हूँ, आपका व्यक्तिगत AI सहायक। आज मैं आपकी कैसे मदद कर सकती हूँ?",
    task_reminder: "अनुस्मारक: {task}",
    memory_saved: "मैं यह याद रखूँगी।",
    session_expired: "आपका सत्र समाप्त हो गया है। जारी रखने के लिए एक नया संदेश भेजें।",
    processing: "मुझे इस पर विचार करने दें...",
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
