// Helpers for the class timetable form: grid <-> stored timetable, and the links the database keeps per session.

export const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const SCHOOL_DAYS = 5;
export const MIN_PERIODS = 8;
export const MAX_PERIODS = 12;

export const isTeacherOptional = (subject) => subject === "التربية الفنية";

export function fillMissingTeachers(grid, teachers) {
  let next = grid;
  Object.entries(grid).forEach(([period, row]) => {
    Object.entries(row).forEach(([day, cell]) => {
      if (!cell?.subject || cell.teacherId || isTeacherOptional(cell.subject)) return;
      const candidates = teachers.filter((teacher) => !teacher.account_deleted &&
        Object.values(teacher.subjects || {}).some((subject) => subject.name === cell.subject));
      if (candidates.length !== 1) return;
      if (next === grid) next = { ...grid };
      next[period] = { ...next[period], [day]: { ...cell, teacherId: candidates[0].id } };
    });
  });
  return next;
}

export const timeToMinutes = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const minutesToTime = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Stored the way the apps do: a fixed day at the admin's local time, serialized as ISO
const toIso = (minutes) => new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toISOString();

export const isoToMinutes = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
};

export const emptyBell = (count = MIN_PERIODS) => Array.from({ length: count }, () => ({ start: "", end: "" }));

// Puts a stored timetable into the grid; sessions with times not in the bell schedule get a period of their own
export function loadGrid(timetable, bellIn) {
  const bell = bellIn.map((b) => ({ ...b }));
  const grid = {};
  let dropped = 0;

  const sessions = [];
  (timetable || []).forEach((d) => (d.sessions || []).forEach((s) => {
    const start = isoToMinutes(s.start);
    const end = isoToMinutes(s.end);
    if (start != null && end != null) sessions.push({ dayIndex: d.dayIndex, subject: s.subject, teacherId: s.teacher_id || "", start, end });
  }));
  sessions.sort((a, b) => a.start - b.start);

  sessions.forEach((s) => {
    let p = bell.findIndex((b) => timeToMinutes(b.start) === s.start && timeToMinutes(b.end) === s.end);

    if (p < 0) {
      p = bell.findIndex((b) => !b.start && !b.end);
      if (p < 0 && bell.length < MAX_PERIODS) {
        bell.push({ start: "", end: "" });
        p = bell.length - 1;
      }
      if (p < 0) { dropped += 1; return; }
      bell[p] = { start: minutesToTime(s.start), end: minutesToTime(s.end) };
    }

    if (!grid[p]) grid[p] = {};
    grid[p][s.dayIndex] = { subject: s.subject, teacherId: s.teacherId };
  });

  return { grid, bell, dropped };
}

export function gridProblem(grid, bell) {
  for (const [p, row] of Object.entries(grid)) {
    for (const [day, cell] of Object.entries(row)) {
      if (!cell?.subject) continue;

      const where = `الحصة ${Number(p) + 1} - ${DAY_LABELS[day]}`;
      if (!cell.teacherId && !isTeacherOptional(cell.subject)) return `${where}: اختر المدرس`;

      const start = timeToMinutes(bell[p]?.start);
      const end = timeToMinutes(bell[p]?.end);
      if (start == null || end == null) return `الحصة ${Number(p) + 1}: حدّد وقت البداية والنهاية`;
      if (end <= start) return `الحصة ${Number(p) + 1}: وقت النهاية يجب أن يكون بعد وقت البداية`;
    }
  }
  return null;
}

// New stored timetable for the class: all seven days, keeping whatever other fields each day entry already has
export function buildTimetable(existing, grid, bell) {
  const byDay = new Map();

  Object.entries(grid).forEach(([p, row]) => Object.entries(row).forEach(([day, cell]) => {
    if (!cell?.subject) return;
    const list = byDay.get(Number(day)) || [];
    list.push({ subject: cell.subject, teacher_id: cell.teacherId, start: timeToMinutes(bell[p].start), end: timeToMinutes(bell[p].end) });
    byDay.set(Number(day), list);
  }));

  return DAY_LABELS.map((label, index) => {
    const current = (existing || []).find((d) => d.dayIndex === index);
    const base = current ? { ...current } : { day: label, dayIndex: index };
    const list = (byDay.get(index) || []).sort((a, b) => a.start - b.start);
    return {
      ...base,
      active: list.length > 0,
      sessions: list.map((s) => ({ subject: s.subject, teacher_id: s.teacher_id, start: toIso(s.start), end: toIso(s.end) })),
    };
  });
}

const sessionCombos = (timetable) => {
  const combos = new Map();
  (timetable || []).forEach((d) => (d.sessions || []).forEach((s) => {
    if (s.teacher_id) combos.set(`${s.subject}|${s.teacher_id}`, { subject: s.subject, teacher: s.teacher_id });
  }));
  return combos;
};

// Which subject/teacher links the database functions must add or drop when a timetable changes
export function diffCombos(oldTimetable, newTimetable) {
  const before = sessionCombos(oldTimetable);
  const after = sessionCombos(newTimetable);
  const afterSubjects = new Set([...after.values()].map((c) => c.subject));
  const seen = new Set([...before.values()].map((c) => c.subject));

  const removed = [...before.entries()]
    .filter(([key]) => !after.has(key))
    .map(([, c]) => ({ ...c, lastForSubject: !afterSubjects.has(c.subject) }));

  const added = [];
  after.forEach((c, key) => {
    if (before.has(key)) return;
    added.push({ ...c, firstForSubject: !seen.has(c.subject) });
    seen.add(c.subject);
  });

  return { removed, added };
}
