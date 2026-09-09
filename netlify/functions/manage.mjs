import { availableSlots, bookingForToken, cancelBooking, rescheduleBooking } from './_calendar.mjs';

export default async (request) => {
  try {
    const url = new URL(request.url);
    const body = request.method === 'GET' ? null : await request.json();
    const token = request.method === 'GET' ? url.searchParams.get('token') : body.token;
    if (!token) return Response.json({ error: 'Booking link missing.' }, { status: 400 });
    if (request.method === 'GET') {
      const booking = await bookingForToken(token);
      if (!booking) return Response.json({ error: 'This booking link is no longer valid.' }, { status: 404 });
      return Response.json({ booking, slots: await availableSlots() });
    }
    const { action, slot } = body;
    if (action === 'cancel') await cancelBooking(token);
    else if (action === 'reschedule') await rescheduleBooking(token, slot);
    else return Response.json({ error: 'Unknown action.' }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not update booking.' }, { status: error.status || 500 });
  }
};
