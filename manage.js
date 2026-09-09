const token = new URLSearchParams(location.search).get('token');
const status = document.querySelector('#status');
const content = document.querySelector('#content');
const calendar = document.querySelector('#calendar');
const slots = document.querySelector('#slots');
const reschedule = document.querySelector('#reschedule');
const cancel = document.querySelector('#cancel');
const monthLabel = document.querySelector('#month-label');
const dayLabel = document.querySelector('#day-label');
let available = [];
let selected;
let visibleMonth = new Date();
let isSubmitting = false;

const dateTime = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const dayText = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const dayKey = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  monthLabel.textContent = visibleMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const days = new Map();
  available.forEach(slot => { const key = dayKey(slot); days.set(key, [...(days.get(key) || []), slot]); });
  calendar.innerHTML = '';
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  for (let index = 0; index < firstWeekday; index += 1) calendar.insertAdjacentHTML('beforeend', '<span></span>');
  const count = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const key = dayKey(new Date(year, month, day, 12));
    const button = document.createElement('button');
    const hasSlots = days.has(key);
    button.className = `day ${hasSlots ? 'available' : 'disabled'}`;
    button.textContent = day;
    button.disabled = !hasSlots;
    if (hasSlots) button.onclick = () => showDay(days.get(key), button);
    calendar.appendChild(button);
  }
}

function showDay(daySlots, button) {
  document.querySelectorAll('.day').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  selected = undefined;
  reschedule.disabled = true;
  dayLabel.textContent = dayText(daySlots[0]);
  slots.innerHTML = '';
  daySlots.forEach(slot => {
    const option = document.createElement('button');
    option.className = 'slot';
    option.type = 'button';
    option.textContent = time(slot);
    option.onclick = () => {
      document.querySelectorAll('.slot').forEach(item => item.classList.remove('selected'));
      option.classList.add('selected');
      selected = slot;
      reschedule.disabled = false;
    };
    slots.appendChild(option);
  });
}

async function call(payload) {
  const response = await fetch('/.netlify/functions/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, token }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

(async () => {
  try {
    const response = await fetch(`/.netlify/functions/manage?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    document.querySelector('#current').innerHTML = `<strong>${dateTime(data.booking.start_at)}</strong>Zurich time`;
    available = data.slots || [];
    if (available.length) { visibleMonth = new Date(available[0]); visibleMonth.setDate(1); }
    renderCalendar();
    status.textContent = 'Select a new time below, or cancel your interview.';
    content.classList.remove('hidden');
  } catch (error) {
    status.className = 'error';
    status.textContent = error.message;
  }
})();

document.querySelector('#previous').onclick = () => { visibleMonth.setMonth(visibleMonth.getMonth() - 1); renderCalendar(); };
document.querySelector('#next').onclick = () => { visibleMonth.setMonth(visibleMonth.getMonth() + 1); renderCalendar(); };

reschedule.onclick = async () => {
  if (!selected || isSubmitting) return;
  isSubmitting = true;
  reschedule.disabled = true;
  reschedule.textContent = 'Rescheduling…';
  try {
    await call({ action: 'reschedule', slot: selected });
    status.className = 'success';
    status.textContent = 'Your booking has been rescheduled. Google Calendar will email the update.';
    content.classList.add('hidden');
  } catch (error) {
    isSubmitting = false;
    reschedule.disabled = false;
    reschedule.textContent = 'Confirm new time';
    status.className = 'error';
    status.textContent = error.message;
  }
};

cancel.onclick = async () => {
  if (isSubmitting || !confirm('Cancel this interview?')) return;
  isSubmitting = true;
  cancel.disabled = true;
  cancel.textContent = 'Cancelling…';
  try {
    await call({ action: 'cancel' });
    status.className = 'success';
    status.textContent = 'Your booking has been cancelled. Google Calendar will email the cancellation.';
    content.classList.add('hidden');
  } catch (error) {
    isSubmitting = false;
    cancel.disabled = false;
    cancel.textContent = 'Cancel booking';
    status.className = 'error';
    status.textContent = error.message;
  }
};
