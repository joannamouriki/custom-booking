const ZONE = 'Europe/Zurich';
const SESSION_MINUTES = 30;

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} configuration.`);
  return value;
};

const partsFor = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
);

const dateKey = (date) => {
  const parts = partsFor(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const nextDate = (date, amount = 1) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return next.toISOString().slice(0, 10);
};

const localTime = (date, hour, minute = 0) => {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const seen = partsFor(new Date(guess));
  const offset = Date.UTC(+seen.year, +seen.month - 1, +seen.day, +seen.hour, +seen.minute) - guess;
  return new Date(guess - offset);
};

const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const overlaps = (start, end, blockStart, blockEnd) => start < blockEnd && end > blockStart;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const hostDateTime = (date) => new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false
}).format(date);

async function notifyHost({ booking, start, meetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const hostEmail = process.env.HOST_EMAIL;
  if (!apiKey || !hostEmail) return;

  const when = hostDateTime(start);
  const name = escapeHtml(booking.attendee_name);
  const email = escapeHtml(booking.attendee_email);
  const meeting = meetUrl ? `<p><a href="${escapeHtml(meetUrl)}">Join Google Meet</a></p>` : '';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `booking-${booking.id}`
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Interview booking <onboarding@resend.dev>',
      to: [hostEmail],
      reply_to: booking.attendee_email,
      subject: `New interview booking — ${when}`,
      html: `<h2>New interview booking</h2><p><strong>${name}</strong> booked an interview.</p><p><strong>When:</strong> ${escapeHtml(when)} (Zurich time)<br><strong>Email:</strong> ${email}</p>${meeting}`
    })
  });

  if (!response.ok) console.error('Host notification email could not be sent.', await response.text());
}

async function supabase(path, options = {}) {
  const response = await fetch(`${env('SUPABASE_URL')}${path}`, {
    ...options,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status}).`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function googleAccessToken() {
  const tokens = await supabase('/rest/v1/google_tokens?id=eq.primary&select=refresh_token');
  const refreshToken = tokens?.[0]?.refresh_token;
  if (!refreshToken) throw new Error('Google Calendar has not been connected yet.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Google Calendar connection needs to be renewed.');
  return data.access_token;
}

export async function availableSlots() {
  const now = new Date();
  const firstDate = dateKey(now);
  const lastDate = process.env.BOOKING_END_DATE || '2026-10-09';
  const candidates = [];

  for (let date = firstDate; date <= lastDate; date = nextDate(date)) {
    const day = weekday(date);
    if (day === 0 || day === 6) continue;

    const blocked = [];
    if (day === 3) blocked.push([localTime(date, 10), localTime(date, 11, 30)]);
    if (day === 5) blocked.push([localTime(date, 9, 30), localTime(date, 11, 30)]);
    if (date === '2026-09-10') blocked.push([localTime(date, 9), localTime(date, 12, 30)]);
    if (date === '2026-09-11') blocked.push([localTime(date, 9), localTime(date, 10, 30)]);
    if (date === '2026-09-21') blocked.push([localTime(date, 12, 30), localTime(date, 15, 30)]);

    for (let hour = 9; hour < 16; hour += 1) {
      for (const minute of [0, 30]) {
        const start = localTime(date, hour, minute);
        const end = new Date(start.getTime() + SESSION_MINUTES * 60_000);
        if (end > localTime(date, 16) || start < new Date(now.getTime() + 24 * 60 * 60_000)) continue;
        if (blocked.some(([blockStart, blockEnd]) => overlaps(start, end, blockStart, blockEnd))) continue;
        candidates.push({ start, end });
      }
    }
  }

  if (!candidates.length) return [];
  const rangeStart = candidates[0].start.toISOString();
  const rangeEnd = candidates.at(-1).end.toISOString();
  const accessToken = await googleAccessToken();
  const busyResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: rangeStart, timeMax: rangeEnd, timeZone: ZONE, items: [{ id: 'primary' }] })
  });
  const busyData = await busyResponse.json();
  if (!busyResponse.ok) throw new Error('Could not read Google Calendar availability.');
  const busy = busyData.calendars?.primary?.busy || [];
  const booked = await supabase(`/rest/v1/bookings?start_at=gte.${encodeURIComponent(rangeStart)}&start_at=lt.${encodeURIComponent(rangeEnd)}&select=start_at`);
  const bookedTimes = new Set(booked.map((booking) => booking.start_at));

  return candidates
    .filter(({ start, end }) => !busy.some((item) => overlaps(start, end, new Date(item.start), new Date(item.end))))
    .filter(({ start }) => !bookedTimes.has(start.toISOString()))
    .map(({ start }) => start.toISOString());
}

export async function reserveBooking(startAt, attendeeName, attendeeEmail) {
  const availability = await availableSlots();
  if (!availability.includes(startAt)) {
    const error = new Error('That time is no longer available.');
    error.status = 409;
    throw error;
  }

  let booking;
  try {
    const rows = await supabase('/rest/v1/bookings', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ start_at: startAt, attendee_name: attendeeName, attendee_email: attendeeEmail })
    });
    booking = rows[0];
  } catch (error) {
    const conflict = new Error('That time was just booked. Please choose another.');
    conflict.status = 409;
    throw conflict;
  }

  try {
    const accessToken = await googleAccessToken();
    const start = new Date(startAt);
    const end = new Date(start.getTime() + SESSION_MINUTES * 60_000);
    const eventResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: 'Interview',
        description: `Interview with Ioanna Mouriki.\n\nNeed to cancel or reschedule?\n${siteUrl()}/manage.html?token=${booking.manage_token}`,
        start: { dateTime: start.toISOString(), timeZone: ZONE },
        end: { dateTime: end.toISOString(), timeZone: ZONE },
        attendees: [{ email: attendeeEmail, displayName: attendeeName }],
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      })
    });
    const event = await eventResponse.json();
    if (!eventResponse.ok) throw new Error('Google Calendar could not create the invitation.');
    const meetUrl = event.hangoutLink || event.conferenceData?.entryPoints?.find((item) => item.entryPointType === 'video')?.uri || null;
    await supabase(`/rest/v1/bookings?id=eq.${booking.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ google_event_id: event.id, meet_url: meetUrl })
    });
    await notifyHost({ booking, start, meetUrl });
    return { meetUrl, manageUrl: `${siteUrl()}/manage.html?token=${booking.manage_token}` };
  } catch (error) {
    await supabase(`/rest/v1/bookings?id=eq.${booking.id}`, { method: 'DELETE' });
    throw error;
  }
}

export async function bookingForToken(token) {
  const rows = await supabase(`/rest/v1/bookings?manage_token=eq.${encodeURIComponent(token)}&select=id,start_at,attendee_name,google_event_id,meet_url`);
  return rows[0] || null;
}

export async function cancelBooking(token) {
  const booking = await bookingForToken(token);
  if (!booking) { const error = new Error('This booking link is no longer valid.'); error.status = 404; throw error; }
  const accessToken = await googleAccessToken();
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?sendUpdates=all`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok && response.status !== 410) throw new Error('Google Calendar could not cancel this event.');
  await supabase(`/rest/v1/bookings?id=eq.${booking.id}`, { method: 'DELETE' });
}

export async function rescheduleBooking(token, startAt) {
  const booking = await bookingForToken(token);
  if (!booking) { const error = new Error('This booking link is no longer valid.'); error.status = 404; throw error; }
  const slots = await availableSlots();
  if (!slots.includes(startAt)) { const error = new Error('That time is no longer available.'); error.status = 409; throw error; }
  const accessToken = await googleAccessToken();
  const start = new Date(startAt);
  const end = new Date(start.getTime() + SESSION_MINUTES * 60_000);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?sendUpdates=all`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: { dateTime: start.toISOString(), timeZone: ZONE }, end: { dateTime: end.toISOString(), timeZone: ZONE } })
  });
  if (!response.ok) throw new Error('Google Calendar could not reschedule this event.');
  await supabase(`/rest/v1/bookings?id=eq.${booking.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ start_at: startAt }) });
}

export async function saveGoogleRefreshToken(refreshToken) {
  await supabase('/rest/v1/google_tokens?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'primary', refresh_token: refreshToken, updated_at: new Date().toISOString() })
  });
}

export const siteUrl = () => env('SITE_URL').replace(/\/$/, '');
