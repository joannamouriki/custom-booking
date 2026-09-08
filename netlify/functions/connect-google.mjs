import { siteUrl } from './_calendar.mjs';

export default async (request) => {
  const url = new URL(request.url);
  const setup = url.searchParams.get('setup');
  if (!setup || setup !== process.env.GOOGLE_SETUP_CODE) return new Response('Not found.', { status: 404 });
  const state = Buffer.from(JSON.stringify({ setup, expires: Date.now() + 10 * 60_000 })).toString('base64url');
  const redirectUri = `${siteUrl()}/.netlify/functions/google-callback`;
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy',
    state
  }).toString();
  return Response.redirect(authorization, 302);
};
