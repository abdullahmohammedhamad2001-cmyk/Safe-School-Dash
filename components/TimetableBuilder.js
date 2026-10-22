"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { supabase, rpc } from "../supabaseClient";
import { useGlobalState } from "../globalState";
import { sortClasses } from "../lib/sortClasses";
import {
  DAY_LABELS, SCHOOL_DAYS, MAX_PERIODS, emptyBell, isoToMinutes, timeToMinutes,
  loadGrid, gridProblem, buildTimetable, diffCombos, isTeacherOptional, fillMissingTeachers,
} from "../lib/timetableForm";

const bellKey = (schoolId) => `timetableBell:${schoolId}`;

const hasSessions = (grid) => Object.values(grid).some((row) => Object.values(row).some((c) => c?.subject));

// Form to build a class timetable: pick subject and teacher for each period and day
const TimetableBuilder = ({ open, onClose }) => {
  const { classes, teachers, refresh } = useGlobalState();

  const [classId, setClassId] = useState("");
  const [bell, setBell] = useState(emptyBell());
  const [grid, setGrid] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const sortedClasses = useMemo(() => sortClasses(classes), [classes]);
  const activeTeachers = useMemo(() => teachers.filter((t) => !t.account_deleted), [teachers]);

  const subjectOptions = useMemo(() => {
    const names = new Set(["التربية الفنية", "الجرائم"]);
    activeTeachers.forEach((t) => Object.values(t.subjects || {}).forEach((s) => names.add(s.name)));
    return [...names].sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeTeachers]);

  const teachersFor = (subject) =>
    activeTeachers.filter((t) => Object.values(t.subjects || {}).some((s) => s.name === subject));

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const next = fillMissingTeachers(grid, activeTeachers);
    if (next !== grid) {
      setGrid(next);
      setDirty(true);
    }
  }, [open, grid, activeTeachers]);

  // The bell schedule is the same for the whole school, so it is remembered on this device
  useEffect(() => {
    if (!open) return;
    try {
      const stored = JSON.parse(localStorage.getItem(bellKey(localStorage.getItem("adminSchoolID"))) || "null");
      if (Array.isArray(stored) && stored.length) setBell(stored);
    } catch {}
  }, [open]);

  const reset = () => {
    setClassId("");
    setGrid({});
    setDirty(false);
    setMessage(null);
  };

  const handleClose = () => {
    if (saving) return;
    if (dirty && !window.confirm("لديك تعديلات غير محفوظة. هل تريد الإغلاق؟")) return;
    reset();
    onClose();
  };

  const loadFrom = (timetable, markDirty) => {
    const loaded = loadGrid(timetable, bell);
    setGrid(loaded.grid);
    setBell(loaded.bell);
    setDirty(markDirty);
    setMessage(loaded.dropped ? { type: "error", text: `${loaded.dropped} حصة بأوقات مختلفة لم تظهر لأن عدد الحصص وصل الحد الأقصى` } : null);
  };

  const selectClass = (id) => {
    if (dirty && !window.confirm("لديك تعديلات غير محفوظة في هذا الصف. هل تريد المتابعة؟")) return;
    setClassId(id);
    if (!id) { setGrid({}); setDirty(false); setMessage(null); return; }
    loadFrom(classes.find((c) => c.id === id)?.timetable, false);
  };

  const copyFrom = (id) => {
    if (!id) return;
    if (hasSessions(grid) && !window.confirm("سيُستبدل الجدول المعروض بجدول الصف المختار. هل تريد المتابعة؟")) return;
    loadFrom(classes.find((c) => c.id === id)?.timetable, true);
  };

  // Teacher choice for a subject: the only teacher, the one already on this class, or the one used elsewhere in this grid
  const pickTeacher = (subject, currentGrid) => {
    const candidates = teachersFor(subject);
    if (candidates.length === 1) return candidates[0].id;

    const assigned = candidates.find((t) =>
      Object.values(t.subjects || {}).some((s) => s.name === subject && (s.class_ids || []).includes(classId)));
    if (assigned) return assigned.id;

    for (const row of Object.values(currentGrid)) {
      for (const cell of Object.values(row)) {
        if (cell?.subject === subject && cell.teacherId && candidates.some((t) => t.id === cell.teacherId)) return cell.teacherId;
      }
    }
    return "";
  };

  const setCell = (p, day, patch) => {
    setGrid((prev) => {
      const next = { ...prev, [p]: { ...(prev[p] || {}) } };
      if (patch === null) delete next[p][day];
      else next[p][day] = { ...(prev[p]?.[day] || {}), ...patch };
      return next;
    });
    setDirty(true);
  };

  const setSubject = (p, day, subject) => {
    if (!subject) { setCell(p, day, null); return; }
    setCell(p, day, { subject, teacherId: pickTeacher(subject, grid) });
  };

  const setBellTime = (p, key, value) => {
    setBell((prev) => prev.map((b, i) => (i === p ? { ...b, [key]: value } : b)));
    setDirty(true);
  };

  // Days with sessions outside the school week (Friday, Saturday) stay visible so nothing is hidden
  const days = useMemo(() => {
    const extra = new Set();
    Object.values(grid).forEach((row) => Object.entries(row).forEach(([day, cell]) => {
      if (Number(day) >= SCHOOL_DAYS && cell?.subject) extra.add(Number(day));
    }));
    return [...Array.from({ length: SCHOOL_DAYS }, (_, i) => i), ...[...extra].sort()];
  }, [grid]);

  // A teacher cannot teach two classes at the same time: compare with every other class
  const conflicts = useMemo(() => {
    const busy = new Map();
    classes.filter((c) => c.id !== classId).forEach((c) =>
      (c.timetable || []).forEach((d) => (d.sessions || []).forEach((s) => {
        const start = isoToMinutes(s.start);
        const end = isoToMinutes(s.end);
        if (!s.teacher_id || start == null || end == null) return;
        const key = `${s.teacher_id}|${d.dayIndex}`;
        busy.set(key, [...(busy.get(key) || []), { start, end, name: c.name }]);
      })));

    const found = new Map();
    Object.entries(grid).forEach(([p, row]) => Object.entries(row).forEach(([day, cell]) => {
      const start = timeToMinutes(bell[p]?.start);
      const end = timeToMinutes(bell[p]?.end);
      if (!cell?.teacherId || start == null || end == null) return;
      const clash = (busy.get(`${cell.teacherId}|${day}`) || []).find((o) => start < o.end && o.start < end);
      if (clash) found.set(`${p}|${day}`, clash.name);
    }));
    return found;
  }, [classes, classId, grid, bell]);

  const handleSave = async () => {
    const schoolId = localStorage.getItem("adminSchoolID");
    const cls = classes.find((c) => c.id === classId);
    if (!cls || !schoolId || schoolId === "ALL") return;

    const problem = gridProblem(grid, bell);
    if (problem) { setMessage({ type: "error", text: problem }); return; }

    if (!hasSessions(grid) && !window.confirm("الجدول فارغ، وسيُحذف الجدول الحالي لهذا الصف. هل تريد المتابعة؟")) return;
    if (conflicts.size && !window.confirm(`يوجد ${conflicts.size} تعارض في أوقات المدرسين. هل تريد الحفظ على أي حال؟`)) return;

    try {
      setSaving(true);
      setMessage(null);

      const timetable = buildTimetable(cls.timetable, grid, bell);
      const { data, error } = await supabase
        .from("classes")
        .update({ timetable })
        .eq("id", cls.id)
        .eq("school_id", schoolId)
        .select("id");

      if (error || !data?.length) throw error || new Error("not saved");

      // Same bookkeeping the apps do when a session is added or removed: teacher links and subject chats
      const { removed, added } = diffCombos(cls.timetable, timetable);
      try {
        for (const r of removed) {
          await rpc("class_session_removed", {
            p_class: cls.id, p_subject: r.subject, p_teacher: r.teacher, p_last_for_subject: r.lastForSubject, p_last_for_teacher: true,
          });
        }
        for (const a of added) {
          await rpc("class_session_added", {
            p_class: cls.id, p_subject: a.subject, p_teacher: a.teacher, p_first_for_subject: a.firstForSubject,
          });
        }
      } catch (err) {
        console.error("Timetable links failed:", err);
        setMessage({ type: "error", text: "حُفظ الجدول لكن تعذّر ربط بعض المدرسين بالصف. أعد الحفظ مرة أخرى." });
        await refresh();
        return;
      }

      try { localStorage.setItem(bellKey(schoolId), JSON.stringify(bell)); } catch {}
      await refresh();
      setDirty(false);
      setMessage({ type: "ok", text: `تم حفظ جدول ${cls.name}` });
    } catch (err) {
      console.error("Save timetable failed:", err);
      setMessage({ type: "error", text: "فشل حفظ الجدول" });
    } finally {
      setSaving(false);
    }
  };

  const noTeachers = activeTeachers.length === 0;

  return (
    <Modal
      title="جدول الحصص"
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={1100}
      maskClosable={false}
    >
      <div className="tt-builder" dir="rtl">
        {noTeachers && (
          <p className="tt-message tt-error">لا يوجد مدرسون مسجّلون لبقية المواد.</p>
        )}

        <div className="tt-toolbar">
          <div className="input-group">
            <label>الصف والشعبة</label>
            <select value={classId} onChange={(e) => selectClass(e.target.value)}>
              <option value="">اختر الصف</option>
              {sortedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="input-group">
            <label>نسخ جدول من صف آخر</label>
            <select value="" onChange={(e) => copyFrom(e.target.value)} disabled={!classId}>
              <option value="">اختر الصف</option>
              {sortedClasses.filter((c) => c.id !== classId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {message && <p className={`tt-message ${message.type === "ok" ? "tt-ok" : "tt-error"}`}>{message.text}</p>}

        {classId && (
          <>
            <div className="tt-wrap">
              <table className="tt-table">
                <thead>
                  <tr>
                    <th>الحصة</th>
                    <th>الوقت</th>
                    {days.map((d) => <th key={d}>{DAY_LABELS[d]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bell.map((b, p) => (
                    <tr key={p}>
                      <td className="tt-period">{p + 1}</td>
                      <td className="tt-time">
                        <input type="time" value={b.start} onChange={(e) => setBellTime(p, "start", e.target.value)} />
                        <input type="time" value={b.end} onChange={(e) => setBellTime(p, "end", e.target.value)} />
                      </td>
                      {days.map((d) => {
                        const cell = grid[p]?.[d];
                        const clash = conflicts.get(`${p}|${d}`);
                        const subjects = cell?.subject && !subjectOptions.includes(cell.subject) ? [...subjectOptions, cell.subject] : subjectOptions;
                        return (
                          <td key={d} className={clash ? "tt-clash" : ""} title={clash ? `المدرس مشغول في ${clash} بنفس الوقت` : undefined}>
                            <select value={cell?.subject || ""} onChange={(e) => setSubject(p, d, e.target.value)}>
                              <option value="">-</option>
                              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {cell?.subject && (
                              <select
                                value={cell.teacherId || ""}
                                onChange={(e) => setCell(p, d, { teacherId: e.target.value })}
                                className={cell.teacherId || isTeacherOptional(cell.subject) ? "" : "tt-missing"}
                              >
                                <option value="">{isTeacherOptional(cell.subject) ? "بدون مدرس (اختياري)" : "اختر المدرس"}</option>
                                {teachersFor(cell.subject).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tt-actions">
              {bell.length < MAX_PERIODS && (
                <button type="button" className="create-submit tt-secondary" onClick={() => setBell((prev) => [...prev, { start: "", end: "" }])}>
                  + إضافة حصة
                </button>
              )}
              {saving ? (
                <ClipLoader size={20} color="#b8860b" />
              ) : (
                <button type="button" className="create-submit" onClick={handleSave}>
                  حفظ الجدول
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default TimetableBuilder;
