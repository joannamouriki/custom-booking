import { reserveBooking } from './_calendar.mjs';

export default async (request) => {
  try {
    if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
    const { slot, name, email } = await request.json();
    if (!slot || !name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return Response.json({ error: 'Please enter a name, email address, and time.' }, { status: 400 });
    const result = await reserveBooking(slot, name.trim(), email.trim());
    return Response.json({ ok: true, meetUrl: result.meetUrl });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || 'Booking could not be completed.' }, { status: error.status || 500 });
  }
};
