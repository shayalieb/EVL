import { useMemo, useState } from 'react';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];

  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrevMonth - startOffset + 1 + i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    cells.push({ day, dateKey: toDateKey(prevYear, prevMonth, day), inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateKey: toDateKey(year, month, day), inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const day = cells.length - (startOffset + daysInMonth) + 1;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    cells.push({ day, dateKey: toDateKey(nextYear, nextMonth, day), inMonth: false });
  }

  return cells;
}

export default function EventsCalendarView({ events, eventStatuses, onSelectEvent }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const evt of events) {
      if (!evt.eventDate) continue;
      if (!map[evt.eventDate]) map[evt.eventDate] = [];
      map[evt.eventDate].push(evt);
    }
    for (const key in map) {
      map[key].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [events]);

  function goToPrevMonth() {
    setCursor(new Date(year, month - 1, 1));
  }

  function goToNextMonth() {
    setCursor(new Date(year, month + 1, 1));
  }

  function goToToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-800">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="Previous month"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Next month"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const dayEvents = eventsByDate[cell.dateKey] || [];
          const isToday = cell.dateKey === todayKey;

          return (
            <div
              key={`${cell.dateKey}-${idx}`}
              className={`min-h-[6.5rem] border-b border-r border-slate-100 px-1.5 py-1.5 [&:nth-child(7n)]:border-r-0 ${
                cell.inMonth ? 'bg-white' : 'bg-slate-50/60'
              }`}
            >
              <div
                className={`text-xs font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-indigo-600 text-white'
                    : cell.inMonth
                    ? 'text-slate-600'
                    : 'text-slate-300'
                }`}
              >
                {cell.day}
              </div>
              <div className="space-y-1">
                {dayEvents.map((evt) => {
                  const status = eventStatuses.find((s) => s.id === evt.eventStatus);
                  const color = status?.color || '#94a3b8';
                  return (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => onSelectEvent(evt)}
                      title={evt.name}
                      className="w-full text-left px-1.5 py-0.5 rounded truncate text-xs font-medium hover:opacity-80"
                      style={{ backgroundColor: `${color}22`, color }}
                    >
                      {evt.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
