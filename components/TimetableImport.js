"use client";

import React, { useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { supabase, rpc } from "../supabaseClient";
import { useGlobalState } from "../globalState";
import { buildPlan, buildTimetableTemplate, diffCombos, downloadBuffer, readTimetableWorkbook } from "../lib/timetableExcel";

const CONCURRENCY = 3;

const STATUS = {
  ready: { label: "سيُستورد", color: "#15803d" },
  skip: { label: "لديه جدول حالي (سيُتخطى)", color: "#a16207" },
  done: { label: "تم", color: "#15803d" },
  partial: { label: "حُفظ الجدول وتعذّر ربط المدرس", color: "#a16207" },
  failed: { label: "فشل", color: "#b91c1c" },
};

const TimetableImport = ({ open, onClose }) => {
  const { classes, teachers, refresh } = useGlobalState();

  const [step, setStep] = useState("start"); // start | preview | importing | done
  const [parsed, setParsed] = useState(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({});
  const fileInput = useRef(null);

  const getContext = () => ({
    schoolId: localStorage.getItem("adminSchoolID"),
  });

  // The preview follows the "replace" checkbox without re-reading the file
  const plan = useMemo(() => {
    if (!parsed) return null;
    return buildPlan(parsed, { classes, teachers, replaceExisting });
  }, [parsed, classes, teachers, replaceExisting]);

  const reset = () => {
    setStep("start");
    setParsed(null);
    setFileName("");
    setFileError("");
    setProgress(0);
    setResults({});
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleClose = () => {
    if (step === "importing") return;
    reset();
    onClose();
  };

  const handleTemplate = async () => {
    try {
      setBusy(true);
      downloadBuffer(await buildTimetableTemplate({ classes, teachers }), "قالب-جداول-الحصص.xlsx");
    } catch (e) {
      console.error("Timetable template failed:", e);
      alert("فشل إنشاء القالب");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError("");
    setFileName(file.name);

    try {
      setBusy(true);
      const result = await readTimetableWorkbook(await file.arrayBuffer());

      if (result.error) {
        setFileError(result.error);
        return;
      }

      setParsed(result);
      setStep("preview");
    } catch (err) {
      console.error("Read timetable failed:", err);
      setFileError("تعذر قراءة الملف. تأكد أنه ملف Excel بصيغة xlsx.");
    } finally {
      setBusy(false);
    }
  };

  const importClass = async (cp, schoolId) => {
    const { data, error } = await supabase
      .from("classes")
      .update({ timetable: cp.timetable })
      .eq("id", cp.classId)
      .eq("school_id", schoolId)
      .select("id");

    if (error || !data?.length) return { status: "failed", note: "تعذر حفظ الجدول" };

    // Same bookkeeping the apps do when a session is added or removed: teacher links and subject chats
    const { removed, added } = diffCombos(cp.oldTimetable, cp.timetable);
    try {
      for (const r of removed) {
        await rpc("class_session_removed", {
          p_class: cp.classId, p_subject: r.subject, p_teacher: r.teacher, p_last_for_subject: r.lastForSubject, p_last_for_teacher: true,
        });
      }
      for (const a of added) {
        await rpc("class_session_added", {
          p_class: cp.classId, p_subject: a.subject, p_teacher: a.teacher, p_first_for_subject: a.firstForSubject,
        });
      }
    } catch (err) {
      console.error("Timetable links failed:", err);
      return { status: "partial", note: "افتح الصف وأعد حفظ حصة لإكمال الربط" };
    }

    return { status: "done", note: "" };
  };

  const handleImport = async () => {
    const { schoolId } = getContext();
    if (!schoolId || schoolId === "ALL") {
      alert("لم يتم العثور على بيانات المدرسة");
      return;
    }

    const queue = plan.classPlans.filter((c) => c.status === "ready");
    if (!queue.length) return;

    setStep("importing");
    setProgress(0);

    const out = {};
    let cursor = 0;
    let finished = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const cp = queue[cursor];
        cursor += 1;

        try {
          out[cp.classId] = await importClass(cp, schoolId);
        } catch (err) {
          console.error("Import class failed:", err);
          out[cp.classId] = { status: "failed", note: "حدث خطأ غير متوقع" };
        }

        finished += 1;
        setProgress(Math.round((finished / queue.length) * 100));
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    setResults(out);
    setStep("done");
    refresh();
  };

  const outcome = useMemo(() => {
    const list = Object.values(results);
    return {
      done: list.filter((r) => r.status === "done").length,
      partial: list.filter((r) => r.status === "partial").length,
      failed: list.filter((r) => r.status === "failed").length,
    };
  }, [results]);

  const shownIssues = plan ? plan.issues.slice(0, 40) : [];

  return (
    <Modal
      title="استيراد جداول الحصص من Excel"
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={900}
      maskClosable={step !== "importing"}
      closable={step !== "importing"}
    >
      <div className="students-import" dir="rtl">

        {step === "start" && (
          <>
            <ol className="students-import-steps">
              <li>حمّل القالب. فيه جدول فارغ لكل صفوف مدرستك.</li>
              <li>اكتب أوقات الحصص مرة واحدة في ورقة «أوقات الحصص»، ثم اختر المادة لكل حصة في ورقة «جدول الحصص».</li>
              <li>ارفع الملف وراجع المعاينة قبل التأكيد. يُحدَّد المدرس تلقائياً من المدرسين الذين يدرّسون المادة.</li>
            </ol>

            <div className="students-import-actions">
              <button className="create-submit" style={{ background: "#64748b" }} onClick={handleTemplate} disabled={busy}>
                تحميل القالب الفارغ
              </button>
              <button className="create-submit" onClick={() => fileInput.current?.click()} disabled={busy}>
                رفع الملف المملوء
              </button>
              <input ref={fileInput} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleFile} />
            </div>

            {busy && <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>}
            {fileError && <p className="students-import-error">{fileError}</p>}
          </>
        )}

        {step !== "start" && plan && (
          <>
            <p className="students-import-file">{fileName}</p>

            <div className="students-import-counts">
              {step === "done" ? (
                <>
                  <span style={{ color: STATUS.done.color }}>تم تحديث: {outcome.done} صف</span>
                  {outcome.partial > 0 && <span style={{ color: STATUS.partial.color }}>ناقص الربط: {outcome.partial}</span>}
                  {outcome.failed > 0 && <span style={{ color: STATUS.failed.color }}>فشل: {outcome.failed}</span>}
                </>
              ) : (
                <>
                  <span style={{ color: STATUS.ready.color }}>صفوف جاهزة: {plan.totals.classesReady}</span>
                  <span style={{ color: STATUS.ready.color }}>حصص ستُستورد: {plan.totals.sessionsReady}</span>
                  {plan.totals.classesSkipped > 0 && <span style={{ color: STATUS.skip.color }}>صفوف ستُتخطى: {plan.totals.classesSkipped}</span>}
                  {plan.totals.skippedCells > 0 && <span style={{ color: STATUS.failed.color }}>خلايا لن تُستورد: {plan.totals.skippedCells}</span>}
                </>
              )}
            </div>

            {step === "preview" && plan.classPlans.some((c) => c.existing > 0) && (
              <label style={{ display: "flex", flexDirection: "row-reverse", justifyContent: "flex-end", gap: 8, fontSize: 14, cursor: "pointer" }}>
                استبدال الجدول الحالي للصفوف التي لها حصص سابقة
                <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
              </label>
            )}

            {step === "importing" && (
              <div className="students-import-progress">
                <div style={{ width: `${progress}%` }} />
                <span>{progress}%</span>
              </div>
            )}

            {shownIssues.length > 0 && step !== "importing" && (
              <div className="students-import-table" style={{ maxHeight: 190 }}>
                <table>
                  <tbody>
                    {shownIssues.map((issue, i) => (
                      <tr key={i}>
                        <td style={{ color: issue.level === "error" ? "#b91c1c" : "#a16207", whiteSpace: "normal" }}>
                          {issue.level === "error" ? "خطأ: " : "ملاحظة: "}{issue.text}
                        </td>
                      </tr>
                    ))}
                    {plan.issues.length > shownIssues.length && (
                      <tr><td>و{plan.issues.length - shownIssues.length} ملاحظة أخرى</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="students-import-table">
              <table>
                <thead>
                  <tr>
                    <th>الصف</th>
                    <th>حصص الملف</th>
                    <th>حصص حالية</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.classPlans.map((c) => {
                    const r = results[c.classId];
                    const state = STATUS[r ? r.status : c.status];
                    return (
                      <tr key={c.classId}>
                        <td>{c.className}</td>
                        <td>{c.sessions.length}</td>
                        <td>{c.existing}</td>
                        <td style={{ color: state.color }}>{state.label}{r?.note ? ` - ${r.note}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="students-import-actions">
              {step === "preview" && (
                <>
                  <button className="create-submit" style={{ background: "#64748b" }} onClick={reset}>ملف آخر</button>
                  <button className="create-submit" onClick={handleImport} disabled={!plan.totals.classesReady}>
                    {plan.totals.classesReady ? `استيراد جداول ${plan.totals.classesReady} صف` : "لا توجد جداول صالحة"}
                  </button>
                </>
              )}
              {step === "importing" && <ClipLoader size={20} color="#b8860b" />}
              {step === "done" && <button className="create-submit" onClick={handleClose}>إغلاق</button>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default TimetableImport;
