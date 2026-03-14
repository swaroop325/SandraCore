export async function research(query: string): Promise<string> {
  const apiKey = process.env["PERPLEXITY_API_KEY"];
  if (!apiKey) {
    throw new Error("Missing PERPLEXITY_API_KEY environment variable.");
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `Perplexity API error: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Unexpected Perplexity API response shape: missing choices[0].message.content");
  }

  return content;
}
