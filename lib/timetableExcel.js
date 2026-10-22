// Excel template and import planning for class timetables (one grid block per class).
import { norm, downloadBuffer } from "./studentsExcel";
import { sortClasses } from "./sortClasses";

export const SHEETS = {
  grid: "جدول الحصص",
  periods: "أوقات الحصص",
  map: "تعيين المدرسين",
  guide: "التعليمات",
  ref: "المراجع",
};
export const PERIODS = 8;
const MAP_ROWS = 150;

// Same list the School app offers when adding a session, plus Social Studies
export const SUBJECTS = [
  "اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الفيزياء", "الكيمياء", "الأحياء", "التاريخ",
  "الجغرافية", "التربية الإسلامية", "التربية الوطنية", "الاجتماعيات", "التربية الفنية", "التربية الرياضية", "الحاسوب",
  "الاقتصاد", "علم الاجتماع", "الفلسفة", "المنطق", "اللغة الفرنسية",
];

// The Iraqi school week starts on Sunday and runs Sunday to Thursday; dayIndex follows the apps
const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const allDays = () => DAY_LABELS.map((label, index) => ({ label, index }));
const schoolDays = () => allDays().slice(0, 5);

const loadExcel = async () => {
  const mod = await import("exceljs");
  return mod.default || mod;
};

const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: "FFBFC5CE" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

const cellText = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    return "";
  }
  return String(v).trim();
};

// Minutes since midnight from an Excel time cell, "8:00", "08:00" or "8:00 PM"
const toMinutes = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") return v >= 0 && v < 1 ? Math.round(v * 1440) : null;
  if (typeof v === "object") {
    if ("result" in v) return toMinutes(v.result);
    if ("text" in v) return toMinutes(v.text);
    return null;
  }

  const m = norm(v).replace(/[.\u066b]/g, ":").match(/^(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?$/);
  if (!m) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3] === "pm" || m[3] === "م") { if (h < 12) h += 12; }
  else if ((m[3] === "am" || m[3] === "ص") && h === 12) h = 0;

  return h < 24 && min < 60 ? h * 60 + min : null;
};

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// Stored the way the apps do: a fixed day at the admin's local time, serialized as ISO
const toIso = (minutes) => new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toISOString();
const isoToMinutes = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
};

export async function buildTimetableTemplate({ classes, teachers }) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Safe School";

  const sortedClasses = sortClasses(classes);
  const subjects = SUBJECTS;
  const days = schoolDays();
  const activeTeachers = teachers.filter((t) => !t.account_deleted);
  const refName = `'${SHEETS.ref}'`;

  // Main grid: one block of periods per class, one column per school day
  const grid = workbook.addWorksheet(SHEETS.grid, {
    views: [{ rightToLeft: true, state: "frozen", xSplit: 2, ySplit: 3 }],
  });
  const lastCol = 2 + days.length;

  grid.mergeCells(1, 1, 1, lastCol);
  const title = grid.getCell(1, 1);
  title.value = "قالب جداول الحصص";
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = fill("FFB8860B");
  title.alignment = { horizontal: "center", vertical: "middle" };
  grid.getRow(1).height = 30;

  grid.mergeCells(2, 1, 2, lastCol);
  const notice = grid.getCell(2, 1);
  notice.value = "اختر المادة لكل حصة من القائمة المنسدلة. اترك الحصة فارغة إن لم تكن موجودة. لا تغيّر عمودي الصف ورقم الحصة. أدخل أوقات الحصص في ورقة «أوقات الحصص».";
  notice.font = { bold: true, color: { argb: "FF7A2E0E" } };
  notice.fill = fill("FFFFF1D6");
  notice.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  grid.getRow(2).height = 36;

  ["الصف", "رقم الحصة", ...days.map((d) => d.label)].forEach((label, i) => {
    const c = grid.getCell(3, i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF344054");
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = box;
  });
  grid.getColumn(1).width = 28;
  grid.getColumn(2).width = 11;
  days.forEach((_, i) => { grid.getColumn(3 + i).width = 22; });

  let row = 4;
  sortedClasses.forEach((cls, ci) => {
    for (let p = 1; p <= PERIODS; p += 1) {
      const nameCell = grid.getCell(row, 1);
      nameCell.value = cls.name;
      const periodCell = grid.getCell(row, 2);
      periodCell.value = p;

      [nameCell, periodCell].forEach((c) => {
        c.font = { bold: true, color: { argb: "FF344054" } };
        c.fill = fill(ci % 2 === 0 ? "FFFFF8E6" : "FFF1F5F9");
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = { ...box, top: p === 1 ? { style: "medium", color: { argb: "FF8A6115" } } : thin };
      });

      days.forEach((_, i) => {
        const c = grid.getCell(row, 3 + i);
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = { ...box, top: p === 1 ? { style: "medium", color: { argb: "FF8A6115" } } : thin };
        c.dataValidation = {
          type: "list", allowBlank: true, formulae: [`${refName}!$A$2:$A$${subjects.length + 1}`],
          showErrorMessage: true, errorStyle: "stop", errorTitle: "مادة غير معروفة", error: "اختر المادة من القائمة.",
        };
      });
      row += 1;
    }
  });

  // Bell schedule, filled once for the whole school
  const periods = workbook.addWorksheet(SHEETS.periods, { views: [{ rightToLeft: true }] });
  periods.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 3 }, { width: 60 }];
  ["رقم الحصة", "وقت البداية", "وقت النهاية"].forEach((label, i) => {
    const c = periods.getCell(1, i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FFB42318");
    c.alignment = { horizontal: "center" };
    c.border = box;
  });
  for (let p = 1; p <= PERIODS; p += 1) {
    const r = p + 1;
    periods.getCell(r, 1).value = p;
    [1, 2, 3].forEach((col) => {
      const c = periods.getCell(r, col);
      c.alignment = { horizontal: "center" };
      c.border = box;
    });
    periods.getCell(r, 1).font = { bold: true };
    periods.getCell(r, 2).numFmt = "hh:mm";
    periods.getCell(r, 3).numFmt = "hh:mm";
  }
  periods.getCell(1, 5).value = "اكتب وقت بداية ونهاية كل حصة تستخدمها، مثل 08:00 و08:45. هذه الأوقات تُطبَّق على كل الصفوف.";
  periods.getCell(1, 5).alignment = { wrapText: true, vertical: "top" };

  // Optional: which teacher gives a subject in a class, needed when several teachers teach the same subject
  const map = workbook.addWorksheet(SHEETS.map, { views: [{ rightToLeft: true }] });
  map.columns = [{ width: 28 }, { width: 24 }, { width: 28 }, { width: 3 }, { width: 60 }];
  ["الصف", "المادة", "المدرس"].forEach((label, i) => {
    const c = map.getCell(1, i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF2563A7");
    c.alignment = { horizontal: "center" };
    c.border = box;
  });
  map.getCell(1, 5).value = "اختياري. استخدم هذه الورقة فقط عندما يدرّس أكثر من مدرس نفس المادة، أو لتحديد مدرس بعينه لصف معيّن.";
  map.getCell(1, 5).alignment = { wrapText: true, vertical: "top" };
  for (let r = 2; r <= MAP_ROWS + 1; r += 1) {
    if (sortedClasses.length) {
      map.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, formulae: [`${refName}!$D$2:$D$${sortedClasses.length + 1}`], showErrorMessage: true, error: "اختر الصف من القائمة." };
    }
    map.getCell(r, 2).dataValidation = { type: "list", allowBlank: true, formulae: [`${refName}!$A$2:$A$${subjects.length + 1}`], showErrorMessage: true, error: "اختر المادة من القائمة." };
    if (activeTeachers.length) {
      map.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: [`${refName}!$B$2:$B$${activeTeachers.length + 1}`], showErrorMessage: true, error: "اختر المدرس من القائمة." };
    }
  }

  const guide = workbook.addWorksheet(SHEETS.guide, { views: [{ rightToLeft: true }] });
  guide.columns = [{ width: 28 }, { width: 100 }];
  guide.addRow(["الخطوة", "الشرح"]);
  guide.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF344054");
  });
  [
    ["1. أوقات الحصص", "في ورقة «أوقات الحصص» اكتب وقت بداية ونهاية كل حصة. الأوقات واحدة لكل الصفوف."],
    ["2. جدول الحصص", `في ورقة «جدول الحصص» لكل صف ${PERIODS} حصص وعمود لكل يوم. اختر المادة في الخلية. الحصة الفارغة تُتجاهل.`],
    ["3. المدرس", "يُحدَّد المدرس تلقائياً من المدرسين الذين يدرّسون المادة. إذا كان أكثر من مدرس يدرّس نفس المادة، حدّد المدرس في ورقة «تعيين المدرسين»."],
    ["4. المدرسون", "يجب أن يكون لكل مادة مدرس مسجّل في تبويب المدرسين، وإلا لا تُستورد حصصها وتظهر لك ملاحظة بذلك."],
    ["5. الرفع", "ارفع الملف من نفس الصفحة وراجع المعاينة قبل التأكيد. الصفوف التي لها جدول حالي تُتخطّى إلا إذا اخترت استبدال الجدول."],
  ].forEach((r) => guide.addRow(r));
  guide.eachRow((r, n) => { if (n > 1) r.alignment = { vertical: "top", wrapText: true }; });

  const ref = workbook.addWorksheet(SHEETS.ref, { views: [{ rightToLeft: true }] });
  ref.columns = [{ width: 26 }, { width: 28 }, { width: 40 }, { width: 30 }];
  ["المواد", "المدرسون", "مواد المدرس", "الصفوف"].forEach((label, i) => {
    const c = ref.getCell(1, i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF344054");
  });
  subjects.forEach((s, i) => { ref.getCell(i + 2, 1).value = s; });
  activeTeachers.forEach((t, i) => {
    ref.getCell(i + 2, 2).value = t.name;
    ref.getCell(i + 2, 3).value = Object.values(t.subjects || {}).map((s) => s.name).join("، ");
  });
  sortedClasses.forEach((c, i) => { ref.getCell(i + 2, 4).value = c.name; });

  return workbook.xlsx.writeBuffer();
}

export async function readTimetableWorkbook(arrayBuffer) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const grid = workbook.getWorksheet(SHEETS.grid);
  if (!grid) return { error: "لم أجد ورقة «جدول الحصص». استخدم القالب الذي حمّلته من هذه الصفحة." };

  const dayByName = new Map(allDays().map((d) => [norm(d.label), d.index]));

  let header = null;
  for (let r = 1; r <= Math.min(grid.rowCount, 12) && !header; r += 1) {
    let classCol = 0;
    let periodCol = 0;
    const dayCols = new Map();
    grid.getRow(r).eachCell((cell, col) => {
      const t = norm(cellText(cell.value));
      if (t === norm("الصف")) classCol = col;
      else if (t === norm("رقم الحصة")) periodCol = col;
      else if (dayByName.has(t)) dayCols.set(col, dayByName.get(t));
    });
    if (classCol && periodCol && dayCols.size) header = { row: r, classCol, periodCol, dayCols };
  }
  if (!header) return { error: "لم أجد عناوين الجدول (الصف، رقم الحصة، الأيام). لا تغيّر صف العناوين في القالب." };

  const rows = [];
  for (let r = header.row + 1; r <= grid.rowCount; r += 1) {
    const className = cellText(grid.getRow(r).getCell(header.classCol).value);
    if (!className) continue;

    const cells = new Map();
    header.dayCols.forEach((dayIndex, col) => {
      const t = cellText(grid.getRow(r).getCell(col).value);
      if (t) cells.set(dayIndex, t);
    });
    if (!cells.size) continue;

    rows.push({
      rowNumber: r,
      className,
      period: parseInt(norm(cellText(grid.getRow(r).getCell(header.periodCol).value)), 10),
      cells,
    });
  }

  const periods = new Map();
  const periodsSheet = workbook.getWorksheet(SHEETS.periods);
  if (periodsSheet) {
    for (let r = 2; r <= periodsSheet.rowCount; r += 1) {
      const row = periodsSheet.getRow(r);
      const p = parseInt(norm(cellText(row.getCell(1).value)), 10);
      if (Number.isInteger(p)) periods.set(p, { start: toMinutes(row.getCell(2).value), end: toMinutes(row.getCell(3).value) });
    }
  }

  const mapping = [];
  const mapSheet = workbook.getWorksheet(SHEETS.map);
  if (mapSheet) {
    for (let r = 2; r <= mapSheet.rowCount; r += 1) {
      const row = mapSheet.getRow(r);
      const entry = {
        rowNumber: r,
        className: cellText(row.getCell(1).value),
        subject: cellText(row.getCell(2).value),
        teacher: cellText(row.getCell(3).value),
      };
      if (entry.className || entry.subject || entry.teacher) mapping.push(entry);
    }
  }

  if (!rows.length) return { error: "لا توجد حصص مكتوبة في الملف. اختر المواد في ورقة «جدول الحصص» أولاً." };

  return { rows, periods, mapping };
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

const countSessions = (timetable) => (timetable || []).reduce((n, d) => n + (d.sessions || []).length, 0);

// Checks the whole file against the school's classes, teachers and bell schedule; nothing is written here
export function buildPlan(parsed, { classes, teachers, replaceExisting }) {
  const issues = [];
  const add = (level, text) => issues.push({ level, text });

  const days = allDays();
  const dayLabel = new Map(days.map((d) => [d.index, d.label]));
  const subjectByNorm = new Map(SUBJECTS.map((s) => [norm(s), s]));
  const classByName = new Map(classes.map((c) => [norm(c.name), c]));
  const activeTeachers = teachers.filter((t) => !t.account_deleted);
  const teacherByName = new Map(activeTeachers.map((t) => [norm(t.name), t]));
  const teachesSubject = (t, subject) => Object.values(t.subjects || {}).some((s) => s.name === subject);
  const assignedToClass = (t, subject, classId) =>
    Object.values(t.subjects || {}).some((s) => s.name === subject && (s.class_ids || []).includes(classId));

  const periodTimes = new Map();
  for (let p = 1; p <= PERIODS; p += 1) {
    const t = parsed.periods.get(p);
    if (!t || (t.start == null && t.end == null)) continue;
    if (t.start == null || t.end == null) { add("error", `الحصة ${p}: وقت البداية أو النهاية غير صحيح`); continue; }
    if (t.end <= t.start) { add("error", `الحصة ${p}: وقت النهاية يجب أن يكون بعد وقت البداية`); continue; }
    periodTimes.set(p, t);
  }
  for (let p = 2; p <= PERIODS; p += 1) {
    const a = periodTimes.get(p - 1);
    const b = periodTimes.get(p);
    if (a && b && b.start < a.end) add("warning", `الحصة ${p} تبدأ قبل نهاية الحصة ${p - 1}`);
  }

  const explicit = new Map();
  parsed.mapping.forEach((m) => {
    if (!m.className || !m.subject || !m.teacher) { add("warning", `تعيين المدرسين، السطر ${m.rowNumber}: السطر ناقص (الصف والمادة والمدرس مطلوبة)`); return; }
    const cls = classByName.get(norm(m.className));
    const subject = subjectByNorm.get(norm(m.subject));
    const teacher = teacherByName.get(norm(m.teacher));
    if (!cls || !subject || !teacher) { add("warning", `تعيين المدرسين، السطر ${m.rowNumber}: الصف أو المادة أو المدرس غير معروف`); return; }
    if (!teachesSubject(teacher, subject)) { add("warning", `تعيين المدرسين، السطر ${m.rowNumber}: المدرس «${teacher.name}» لا يدرّس ${subject}`); return; }
    explicit.set(`${cls.id}|${subject}`, teacher);
  });

  const resolved = new Map();
  const resolveTeacher = (cls, subject) => {
    const key = `${cls.id}|${subject}`;
    if (resolved.has(key)) return resolved.get(key);

    let result;
    if (explicit.has(key)) {
      result = { teacher: explicit.get(key) };
    } else {
      const candidates = activeTeachers.filter((t) => teachesSubject(t, subject));
      if (candidates.length === 1) {
        result = { teacher: candidates[0] };
      } else if (candidates.length > 1) {
        const assigned = candidates.filter((t) => assignedToClass(t, subject, cls.id));
        result = assigned.length === 1
          ? { teacher: assigned[0] }
          : { reason: "يدرّسها أكثر من مدرس، حدّد المدرس في ورقة «تعيين المدرسين»" };
      } else {
        result = { reason: "لا يوجد مدرس مسجّل يدرّس هذه المادة" };
      }
    }
    resolved.set(key, result);
    return result;
  };

  const byClass = new Map();
  const unknownClasses = new Set();
  const missingTime = new Map();
  const unresolved = new Map();
  let skippedCells = 0;

  parsed.rows.forEach((r) => {
    const cls = classByName.get(norm(r.className));
    if (!cls) { unknownClasses.add(r.className); skippedCells += r.cells.size; return; }
    if (!Number.isInteger(r.period) || r.period < 1 || r.period > PERIODS) {
      add("error", `${r.className}، السطر ${r.rowNumber}: رقم الحصة غير صحيح`);
      skippedCells += r.cells.size;
      return;
    }

    r.cells.forEach((text, dayIndex) => {
      const subject = subjectByNorm.get(norm(text));
      if (!subject) {
        add("error", `${r.className} - الحصة ${r.period} - ${dayLabel.get(dayIndex)}: المادة «${text}» غير معروفة`);
        skippedCells += 1;
        return;
      }

      const time = periodTimes.get(r.period);
      if (!time) {
        missingTime.set(r.period, (missingTime.get(r.period) || 0) + 1);
        skippedCells += 1;
        return;
      }

      const { teacher, reason } = resolveTeacher(cls, subject);
      if (!teacher) {
        const key = `${cls.id}|${subject}`;
        const entry = unresolved.get(key) || { cls, subject, reason, count: 0 };
        entry.count += 1;
        unresolved.set(key, entry);
        skippedCells += 1;
        return;
      }

      if (!byClass.has(cls.id)) byClass.set(cls.id, { cls, sessions: [] });
      byClass.get(cls.id).sessions.push({ dayIndex, period: r.period, subject, teacherId: teacher.id, teacherName: teacher.name, start: time.start, end: time.end });
    });
  });

  unknownClasses.forEach((name) => add("error", `الصف «${name}» غير موجود في المدرسة (لا تغيّر أسماء الصفوف في القالب)`));
  missingTime.forEach((n, p) => add("error", `الحصة ${p} مستخدمة في الجدول لكن وقتها غير مكتوب في ورقة «أوقات الحصص» (${n} خلية لن تُستورد)`));
  unresolved.forEach((e) => add("warning", `${e.cls.name} - ${e.subject}: ${e.reason} (${e.count} حصة لن تُستورد)`));

  const classPlans = [];
  byClass.forEach(({ cls, sessions }) => {
    const existing = countSessions(cls.timetable);
    const status = existing > 0 && !replaceExisting ? "skip" : "ready";

    const timetable = allDays().map((d) => {
      const current = (cls.timetable || []).find((x) => x.dayIndex === d.index);
      const base = current ? { ...current } : { day: d.label, dayIndex: d.index };
      const list = sessions.filter((s) => s.dayIndex === d.index).sort((a, b) => a.start - b.start);
      return {
        ...base,
        active: list.length > 0,
        sessions: list.map((s) => ({ subject: s.subject, teacher_id: s.teacherId, start: toIso(s.start), end: toIso(s.end) })),
      };
    });

    classPlans.push({
      classId: cls.id,
      className: cls.name,
      status,
      existing,
      sessions,
      oldTimetable: cls.timetable || [],
      timetable,
    });
  });

  const order = new Map(sortClasses(classes).map((c, i) => [c.id, i]));
  classPlans.sort((a, b) => (order.get(a.classId) ?? 0) - (order.get(b.classId) ?? 0));

  // A teacher cannot be in two classes at the same time: compare new sessions with every other class timetable
  const importing = new Set(classPlans.filter((c) => c.status === "ready").map((c) => c.classId));
  const slots = new Map();
  const push = (teacherId, dayIndex, start, end, label) => {
    const key = `${teacherId}|${dayIndex}`;
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push({ start, end, label });
  };
  classPlans.filter((c) => c.status === "ready").forEach((c) =>
    c.sessions.forEach((s) => push(s.teacherId, s.dayIndex, s.start, s.end, c.className)));
  classes.filter((c) => !importing.has(c.id)).forEach((c) =>
    (c.timetable || []).forEach((d) => (d.sessions || []).forEach((s) => {
      const start = isoToMinutes(s.start);
      const end = isoToMinutes(s.end);
      if (s.teacher_id && start != null && end != null) push(s.teacher_id, d.dayIndex, start, end, c.name);
    })));

  const teacherName = new Map(activeTeachers.map((t) => [t.id, t.name]));
  let conflicts = 0;
  slots.forEach((list, key) => {
    const [teacherId, dayIndex] = key.split("|");
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].start < list[i - 1].end && list[i].label !== list[i - 1].label) {
        conflicts += 1;
        if (conflicts <= 20) {
          add("warning", `تعارض: المدرس «${teacherName.get(teacherId) || "-"}» يوم ${dayLabel.get(Number(dayIndex))} (${clock(list[i].start)}) في ${list[i - 1].label} و${list[i].label}`);
        }
      }
    }
  });
  if (conflicts > 20) add("warning", `و${conflicts - 20} تعارض آخر في أوقات المدرسين`);

  const ready = classPlans.filter((c) => c.status === "ready");
  return {
    issues,
    classPlans,
    totals: {
      classesReady: ready.length,
      classesSkipped: classPlans.length - ready.length,
      sessionsReady: ready.reduce((n, c) => n + c.sessions.length, 0),
      skippedCells,
      errors: issues.filter((i) => i.level === "error").length,
    },
  };
}

export { downloadBuffer };
