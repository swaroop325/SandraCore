import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("tools");
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar";

export interface WebSearchResult {
  answer: string;
  citations: string[];
  query: string;
  searchedAt: string;
}

/**
 * Search the web using Perplexity AI's sonar model.
 * Returns a grounded answer with citations.
 * Requires PERPLEXITY_API_KEY env var.
 */
export async function webSearch(query: string): Promise<WebSearchResult> {
  const apiKey = process.env["PERPLEXITY_API_KEY"];
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set");
  }

  if (!query || query.trim().length === 0) {
    throw new Error("Search query cannot be empty");
  }

  const trimmed = query.trim().slice(0, 500); // cap query length

  log.debug("Web search", { query: trimmed });

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [
        {
          role: "system",
          content: "Be precise and factual. Cite your sources.",
        },
        {
          role: "user",
          content: trimmed,
        },
      ],
      return_citations: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Perplexity API error: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{
      message: { content: string };
    }>;
    citations?: string[];
  };

  const answer = data.choices[0]?.message.content ?? "";
  const citations = data.citations ?? [];

  return {
    answer,
    citations,
    query: trimmed,
    searchedAt: new Date().toISOString(),
  };
}
