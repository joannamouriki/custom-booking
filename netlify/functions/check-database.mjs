const keyKind = (key) => {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'Supabase secret key';
  if (key.startsWith('sb_publishable_')) return 'publishable key (not suitable)';
  if (key.startsWith('eyJ')) {
    try { return `legacy JWT with role: ${JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || 'unknown'}`; } catch { return 'unreadable legacy JWT'; }
  }
  return 'unrecognised key format';
};

export default async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ready: false, message: 'A required database setting is missing.' }, { status: 500 });
  const response = await fetch(`${url}/rest/v1/google_tokens?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const details = await response.text();
  return Response.json({
    ready: response.ok,
    keyKind: keyKind(key),
    databaseStatus: response.status,
    databaseMessage: details.slice(0, 500)
  }, { status: response.ok ? 200 : 500 });
};
