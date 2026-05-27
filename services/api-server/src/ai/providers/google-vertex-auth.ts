import crypto from "node:crypto";

export interface GoogleVertexCredentialConfig {
  credentialType?: string | null;
  authMethod?: string | null;
  decryptedSecret?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GoogleVertexToken {
  accessToken: string;
  source: "service_account_json" | "access_token" | "metadata_server";
}

interface ServiceAccountJson {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

export async function resolveGoogleVertexAccessToken(
  credential?: GoogleVertexCredentialConfig | null
): Promise<GoogleVertexToken> {
  const authMethod = String(credential?.authMethod ?? credential?.credentialType ?? "").toLowerCase();
  const secret = String(credential?.decryptedSecret ?? "").trim();

  if (authMethod === "access_token" || credential?.credentialType === "vertex_access_token") {
    if (!secret) throw new Error("Google Vertex access token credential is empty");
    return { accessToken: secret, source: "access_token" };
  }

  if (secret) {
    return {
      accessToken: await serviceAccountJsonToAccessToken(parseServiceAccountJson(secret)),
      source: "service_account_json"
    };
  }

  const metadataToken = await tryMetadataServerToken();
  if (metadataToken) {
    return { accessToken: metadataToken, source: "metadata_server" };
  }

  throw new Error("Google Vertex credential is not configured");
}

function parseServiceAccountJson(secret: string): ServiceAccountJson {
  try {
    const parsed = JSON.parse(secret) as ServiceAccountJson;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing client_email or private_key");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid Google service account JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function serviceAccountJsonToAccessToken(serviceAccount: ServiceAccountJson) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT"
    },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      iat: now,
      exp: now + 3600
    },
    serviceAccount.private_key!
  );
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const json = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !json.access_token) {
    throw new Error(`Google OAuth token exchange failed: ${response.status} ${String(json.error_description ?? json.error ?? response.statusText)}`);
  }
  return String(json.access_token);
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function tryMetadataServerToken() {
  try {
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(1000)
      }
    );
    if (!response.ok) return null;
    const json = (await response.json()) as any;
    return typeof json.access_token === "string" ? json.access_token : null;
  } catch {
    return null;
  }
}
