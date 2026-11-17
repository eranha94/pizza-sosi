/**
 * Reads a secret from Secret Manager at runtime with the function's own identity (metadata server).
 * Secrets never live in the repo, the bundle, Firestore or the browser. Cached for 5 minutes.
 * The function's service account needs roles/secretmanager.secretAccessor on each secret.
 */
const cache = new Map<string, { value: string; at: number }>();

export async function readSecret(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  const meta = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!meta.ok) throw new Error(`metadata token ${meta.status}`);
  const { access_token } = (await meta.json()) as { access_token: string };
  const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${name}/versions/latest:access`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`secret ${name} ${res.status}`);
  const body = (await res.json()) as { payload: { data: string } };
  const value = Buffer.from(body.payload.data, 'base64').toString('utf8').trim();
  cache.set(name, { value, at: Date.now() });
  return value;
}
