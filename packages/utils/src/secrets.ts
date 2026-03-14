import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { REGION } from "@sandra/core";
import { registerSecretForRedaction } from "./logger.js";

let client: SecretsManagerClient | null = null;

let loaded = false;

export async function loadSecrets(): Promise<void> {
  if (loaded) return;
  if (!client) client = new SecretsManagerClient({ region: REGION });
  const cmd = new GetSecretValueCommand({ SecretId: "sandra/prod" });
  const res = await client.send(cmd);
  if (!res.SecretString) throw new Error("SecretString is empty");
  const secrets = JSON.parse(res.SecretString) as Record<string, string>;
  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
    registerSecretForRedaction(value);
  }
  loaded = true;
}

/** Reset loader state — for testing only */
export function _resetSecretsLoader(): void {
  loaded = false;
  client = null;
}
