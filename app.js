const modal = document.querySelector('#booker');
const calendar = document.querySelector('#calendar');
const status = document.querySelector('#status');
const slots = document.querySelector('#slots');
const form = document.querySelector('#form');
const timePicker = document.querySelector('#time-picker');
const monthLabel = document.querySelector('#month-label');
const dayLabel = document.querySelector('#day-label');

let available = [];
let selected;
let visibleMonth = new Date();
visibleMonth.setDate(1);

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
});

function localDateKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(value));
}

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  monthLabel.textContent = visibleMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const slotsByDay = new Map();
  available.forEach(slot => {
    const key = localDateKey(slot);
    slotsByDay.set(key, [...(slotsByDay.get(key) || []), slot]);
  });
  calendar.innerHTML = '';
  for (let i = 0; i < firstWeekday; i += 1) calendar.insertAdjacentHTML('beforeend', '<span></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(year, month, day, 12));
    const hasSlots = slotsByDay.has(key);
    const button = document.createElement('button');
    button.className = `day ${hasSlots ? 'available' : 'disabled'}`;
    button.textContent = day;
    button.disabled = !hasSlots;
    if (hasSlots) button.onclick = () => showDay(key, slotsByDay.get(key), button);
    calendar.appendChild(button);
  }
}

function showDay(key, daySlots, button) {
  document.querySelectorAll('.day').forEach(day => day.classList.remove('active'));
  button.classList.add('active');
  selected = undefined;
  form.classList.add('hidden');
  timePicker.classList.remove('hidden');
  const date = new Date(daySlots[0]);
  dayLabel.textContent = formatter.format(date);
  slots.innerHTML = '';
  daySlots.forEach(slot => {
    const option = document.createElement('button');
    option.className = 'slot';
    option.type = 'button';
    option.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(slot));
    option.onclick = () => {
      document.querySelectorAll('.slot').forEach(item => item.classList.remove('selected'));
      option.classList.add('selected');
      selected = slot;
      form.classList.remove('hidden');
    };
    slots.appendChild(option);
  });
}

async function openBooking() {
  modal.showModal();
  status.className = '';
  status.textContent = 'Loading live availability…';
  timePicker.classList.add('hidden');
  form.classList.add('hidden');
  try {
    const response = await fetch('/.netlify/functions/availability');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Availability is not ready yet.');
    available = data.slots || [];
    status.textContent = available.length ? 'Choose an available day in the calendar.' : 'There are no remaining interview times.';
    renderCalendar();
  } catch (error) {
    status.className = 'error';
    status.textContent = 'The calendar connection is not ready yet. Please try again shortly.';
  }
}

document.querySelector('#open').onclick = openBooking;
document.querySelector('#close').onclick = () => modal.close();
document.querySelector('#previous').onclick = () => { visibleMonth.setMonth(visibleMonth.getMonth() - 1); renderCalendar(); };
document.querySelector('#next').onclick = () => { visibleMonth.setMonth(visibleMonth.getMonth() + 1); renderCalendar(); };

form.onsubmit = async event => {
  event.preventDefault();
  if (!selected) return;
  status.className = '';
  status.textContent = 'Confirming your booking…';
  try {
    const response = await fetch('/.netlify/functions/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: selected, name: document.querySelector('#name').value, email: document.querySelector('#email').value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    status.className = 'success';
    status.textContent = 'Confirmed — check your email for the Google Calendar invitation.';
    timePicker.classList.add('hidden');
    form.classList.add('hidden');
  } catch (error) {
    status.className = 'error';
    status.textContent = error.message || 'Booking could not be completed. Please choose another time.';
  }
};
