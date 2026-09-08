import { availableSlots } from './_calendar.mjs';

export default async () => {
  try {
    return Response.json({ slots: await availableSlots() }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 503 });
  }
};
