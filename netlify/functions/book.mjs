export default async () => Response.json({ error: "Booking setup is not connected yet." }, { status: 503 });
// Next: atomically reserve the slot in Supabase, create a Google Calendar event + Meet,
// and invite the attendee using the Google Calendar API.
