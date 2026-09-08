export default async () => Response.json({ slots: [] }, { status: 503 });
// Next: query Google Calendar free/busy and return 30-minute Europe/Zurich slots.
