import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { REGION } from "@sandra/core";

export const bedrock = new BedrockRuntimeClient({ region: REGION });
