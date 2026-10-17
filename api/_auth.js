export async function requireSignedInUser(request, response) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (process.env.VERCEL) {
      response.status(503).json({ error: 'Sign-in verification is not configured.' });
      return false;
    }
    return true;
  }
  const token = String(request.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    response.status(401).json({ error: 'Sign in to use Velora AI.' });
    return false;
  }
  try {
    const result = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!result.ok) {
      response.status(401).json({ error: 'Your sign-in expired. Sign in again.' });
      return false;
    }
    const user = await result.json();
    if (!user?.id) { response.status(401).json({ error: 'Your sign-in could not be verified.' }); return false; }
    return true;
  } catch {
    response.status(503).json({ error: 'Could not verify your sign-in.' });
    return false;
  }
}
