export type { Message } from "./short-term.js";
export { loadHistory, appendMessage, clearHistory } from "./short-term.js";
export { writeMemory, recallMemory, forgetAllMemories, forgetMemory } from "./long-term.js";
export {
  setEmbeddingProvider,
  getEmbeddingProvider,
  autoConfigureEmbeddingProvider,
  createBedrockEmbeddingProvider,
  createOllamaEmbeddingProvider,
  createOpenAIEmbeddingProvider,
} from "./embedding-provider.js";
export type { EmbeddingProvider } from "./embedding-provider.js";
export { createEmbeddingCache } from "./embedding-cache.js";
export type { EmbeddingCache } from "./embedding-cache.js";
export { expandQueryToKeywords, STOP_WORDS_EN } from "./query-expansion.js";
export { createFtsStore } from "./fts.js";
export type { FtsStore, FtsMemory } from "./fts.js";
export { hybridSearch } from "./hybrid.js";
export type { HybridResult, HybridSearchOptions } from "./hybrid.js";
