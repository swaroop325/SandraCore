import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { REGION, MODELS, BEDROCK_VERSION } from "@sandra/core";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("media");
const client = new BedrockRuntimeClient({ region: REGION });

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface ImageAnalysisInput {
  /** Base64-encoded image data */
  imageBase64: string;
  /** MIME type of the image */
  mediaType: ImageMediaType;
  /** Optional question about the image */
  question?: string;
}

export interface ImageAnalysisResult {
  description: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_QUESTION = "Describe this image in detail. Include any text, objects, people, colors, and context you can see.";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB base64

/**
 * Analyze an image using Claude's vision capability via AWS Bedrock.
 * Uses Claude Sonnet (multimodal) for best quality.
 */
export async function analyzeImage(input: ImageAnalysisInput): Promise<ImageAnalysisResult> {
  const { imageBase64, mediaType, question } = input;

  // Check approximate size (base64 is ~4/3 of binary)
  const approxBytes = (imageBase64.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image too large: ${Math.round(approxBytes / 1024)}KB (max 5MB)`);
  }

  const prompt = question ?? DEFAULT_QUESTION;

  const body = {
    anthropic_version: BEDROCK_VERSION,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  };

  log.debug("Analyzing image", { mediaType, approxKb: Math.round(approxBytes / 1024) });

  const response = await client.send(
    new InvokeModelCommand({
      modelId: MODELS.SONNET,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    })
  );

  const result = JSON.parse(Buffer.from(response.body).toString("utf-8")) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  const text = result.content.find((c) => c.type === "text")?.text ?? "";

  return {
    description: text,
    model: result.model ?? MODELS.SONNET,
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
  };
}

/**
 * Fetch an image from a URL and analyze it.
 * Performs SSRF protection: only http/https allowed.
 */
export async function analyzeImageFromUrl(
  imageUrl: string,
  question?: string
): Promise<ImageAnalysisResult> {
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported for image analysis");
  }

  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const validTypes: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mediaType = validTypes.find((t) => contentType.startsWith(t)) ?? "image/jpeg";

  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString("base64");

  const input: ImageAnalysisInput = { imageBase64, mediaType };
  if (question !== undefined) input.question = question;
  return analyzeImage(input);
}
