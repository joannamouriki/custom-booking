import { saveGoogleRefreshToken, siteUrl } from './_calendar.mjs';

export default async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  let state;
  try { state = JSON.parse(Buffer.from(url.searchParams.get('state') || '', 'base64url').toString()); } catch { return new Response('Invalid connection request.', { status: 400 }); }
  if (!code || state.setup !== process.env.GOOGLE_SETUP_CODE || state.expires < Date.now()) return new Response('Connection request expired. Please start again.', { status: 400 });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${siteUrl()}/.netlify/functions/google-callback`, grant_type: 'authorization_code' })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.refresh_token) return new Response('Google did not provide a refresh token. Please start the connection again.', { status: 400 });
  await saveGoogleRefreshToken(tokens.refresh_token);
  return new Response('<!doctype html><title>Google Calendar connected</title><main><h1>Google Calendar connected</h1><p>You can close this window and return to the booking site.</p></main>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
