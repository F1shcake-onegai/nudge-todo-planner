import { SECRET_KEYS, listSecretsStatus, setSecret, type SecretKey } from "@/lib/secrets";

export async function GET() {
  const rows = await listSecretsStatus();
  return Response.json({ secrets: rows });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as Record<string, string | null>;
  for (const k of Object.keys(body)) {
    if ((SECRET_KEYS as readonly string[]).includes(k)) {
      await setSecret(k as SecretKey, body[k]);
    }
  }
  const rows = await listSecretsStatus();
  return Response.json({ secrets: rows });
}
