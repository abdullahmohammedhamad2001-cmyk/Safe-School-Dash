"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { rpc, enrollErrorMessage } from "../supabaseClient";
import { useGlobalState } from "../globalState";
import { buildReport, buildTemplate, downloadBuffer, readWorkbook, validateRows } from "../lib/studentsExcel";

const CONCURRENCY = 4;

const defaultAcademicYear = () => {
  const today = new Date();
  const year = today.getFullYear();
  return today.getMonth() + 1 >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const academicYearOptions = () => {
  const year = new Date().getFullYear();
  return [`${year - 1}-${year}`, `${year}-${year + 1}`];
};

const STATUS_LABEL = {
  ok: "جاهز",
  error: "خطأ",
  duplicate: "مكرر",
  created: "تم",
  failed: "فشل",
};

const STATUS_COLOR = {
  ok: "#15803d",
  created: "#15803d",
  error: "#b91c1c",
  failed: "#b91c1c",
  duplicate: "#a16207",
};

const StudentsImport = ({ open, onClose }) => {
  const { students, classes, refresh } = useGlobalState();

  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [step, setStep] = useState("start"); // start | preview | importing | done
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef(null);

  useEffect(() => {
    if (open) setAcademicYear(defaultAcademicYear());
  }, [open]);

  const counts = useMemo(() => {
    const c = { ok: 0, error: 0, duplicate: 0, created: 0, failed: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const reset = () => {
    setStep("start");
    setRows([]);
    setFileName("");
    setFileError("");
    setProgress(0);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleClose = () => {
    if (step === "importing") return;
    reset();
    onClose();
  };

  const getContext = () => {
    const schoolId = localStorage.getItem("adminSchoolID");
    const country = localStorage.getItem("schoolCountry") || "iraq";
    return { schoolId, country };
  };

  const handleTemplate = async () => {
    try {
      setBusy(true);
      const { country } = getContext();
      const buffer = await buildTemplate({ classes, country });
      downloadBuffer(buffer, "قالب-الطلاب.xlsx");
    } catch (e) {
      console.error("Template failed:", e);
      alert("فشل إنشاء القالب");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError("");
    setRows([]);
    setFileName(file.name);

    try {
      setBusy(true);
      const { country } = getContext();
      const parsed = await readWorkbook(await file.arrayBuffer());

      if (parsed.error) {
        setFileError(parsed.error);
        return;
      }

      setRows(validateRows(parsed.rows, { classes, existingStudents: students, country }));
      setStep("preview");
    } catch (err) {
      console.error("Read excel failed:", err);
      setFileError("تعذر قراءة الملف. تأكد أنه ملف Excel بصيغة xlsx.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    const { schoolId, country } = getContext();
    if (!schoolId || schoolId === "ALL") {
      alert("لم يتم العثور على بيانات المدرسة");
      return;
    }

    const queue = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === "ok");
    if (!queue.length) return;

    setStep("importing");
    setProgress(0);

    const next = rows.map((r) => ({ ...r }));
    const blockedClasses = new Map(); // class id -> message, when its fees are not set up for this year
    let cursor = 0;
    let finished = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const { r, i } = queue[cursor];
        cursor += 1;

        if (blockedClasses.has(r.data.class_id)) {
          next[i].status = "failed";
          next[i].note = blockedClasses.get(r.data.class_id);
        } else {
          try {
            const id = await rpc("create_student", {
              p_school: schoolId,
              p_name: r.data.name,
              p_parent_name: r.data.parent_name,
              p_phone: r.data.phone,
              p_sex: r.data.sex,
              p_birth: r.data.birth,
              p_class: r.data.class_id,
              p_year: academicYear,
              p_country: country,
            });
            next[i].status = "created";
            next[i].note = "";
            next[i].studentId = id;
          } catch (err) {
            const known = enrollErrorMessage(err, academicYear);
            next[i].status = "failed";
            next[i].note = (known || "فشل إنشاء الطالب").replace(/\s*\n\s*/g, " ");
            if (known) blockedClasses.set(r.data.class_id, next[i].note);
          }
        }

        finished += 1;
        setProgress(Math.round((finished / queue.length) * 100));
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    setRows(next);
    setStep("done");
    refresh();
  };

  const handleReport = async () => {
    try {
      const buffer = await buildReport(rows);
      downloadBuffer(buffer, "نتيجة-استيراد-الطلاب.xlsx");
    } catch (e) {
      console.error("Report failed:", e);
      alert("فشل إنشاء التقرير");
    }
  };

  return (
    <Modal
      title="استيراد الطلاب من Excel"
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={860}
      maskClosable={step !== "importing"}
      closable={step !== "importing"}
    >
      <div className="students-import" dir="rtl">

        {step === "start" && (
          <>
            <ol className="students-import-steps">
              <li>حمّل القالب. تحتوي ورقة «الصفوف الموجودة» على صفوف مدرستك.</li>
              <li>املأ بيانات الطلاب في القالب ثم احفظ الملف.</li>
              <li>ارفع الملف هنا، وراجع النتيجة قبل التأكيد.</li>
            </ol>

            <div className="input-group">
              <label>السنة الدراسية (لجميع طلاب الملف)</label>
              <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                {academicYearOptions().map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="students-import-actions">
              <button className="create-submit" style={{ background: "#64748b" }} onClick={handleTemplate} disabled={busy}>
                تحميل القالب
              </button>
              <button className="create-submit" onClick={() => fileInput.current?.click()} disabled={busy}>
                رفع الملف المملوء
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={handleFile}
              />
            </div>

            {busy && <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>}
            {fileError && <p className="students-import-error">{fileError}</p>}
          </>
        )}

        {(step === "preview" || step === "importing" || step === "done") && (
          <>
            <p className="students-import-file">{fileName} - السنة الدراسية {academicYear}</p>

            <div className="students-import-counts">
              {step === "done" ? (
                <>
                  <span style={{ color: STATUS_COLOR.created }}>تم إنشاء: {counts.created}</span>
                  <span style={{ color: STATUS_COLOR.failed }}>فشل: {counts.failed}</span>
                </>
              ) : (
                <span style={{ color: STATUS_COLOR.ok }}>جاهز: {counts.ok}</span>
              )}
              <span style={{ color: STATUS_COLOR.duplicate }}>مكرر (سيتخطى): {counts.duplicate}</span>
              <span style={{ color: STATUS_COLOR.error }}>أخطاء (سيتخطى): {counts.error}</span>
            </div>

            {step === "importing" && (
              <div className="students-import-progress">
                <div style={{ width: `${progress}%` }} />
                <span>{progress}%</span>
              </div>
            )}

            <div className="students-import-table">
              <table>
                <thead>
                  <tr>
                    <th>السطر</th>
                    <th>الطالب</th>
                    <th>ولي الأمر</th>
                    <th>الهاتف</th>
                    <th>الصف</th>
                    <th>الحالة</th>
                    <th>كود الطالب</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td>{r.data.name}</td>
                      <td>{r.data.parent_name}</td>
                      <td dir="ltr">{r.data.phone}</td>
                      <td>{r.data.class_name}</td>
                      <td style={{ color: STATUS_COLOR[r.status] }}>
                        {STATUS_LABEL[r.status]}
                        {r.note ? ` - ${r.note}` : ""}
                      </td>
                      <td dir="ltr">{r.studentId || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="students-import-actions">
              {step === "preview" && (
                <>
                  <button className="create-submit" style={{ background: "#64748b" }} onClick={reset}>
                    ملف آخر
                  </button>
                  <button className="create-submit" onClick={handleImport} disabled={!counts.ok}>
                    {counts.ok ? `استيراد ${counts.ok} طالب` : "لا يوجد طلاب صالحون"}
                  </button>
                </>
              )}

              {step === "importing" && <ClipLoader size={20} color="#b8860b" />}

              {step === "done" && (
                <>
                  <button className="create-submit" style={{ background: "#64748b" }} onClick={handleReport}>
                    تحميل تقرير النتيجة
                  </button>
                  <button className="create-submit" onClick={handleClose}>
                    إغلاق
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default StudentsImport;
