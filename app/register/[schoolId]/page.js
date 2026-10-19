"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { rpc, publicUrl } from "../../../supabaseClient";
import { sortClasses } from "../../../lib/sortClasses";
import { normalizePhone } from "../../../lib/studentsExcel";
import { downloadRegistrationPdf } from "../../../lib/registrationPdf";
import "../../style.css";

const ERRORS = {
  REGISTRATION_CLOSED: "التسجيل متوقف حالياً.",
  ALREADY_REGISTERED: "هذا الطالب مسجل مسبقاً. إذا فقدت كود التفعيل فتواصل مع إدارة المدرسة.",
  RATE_LIMITED: "عدد المحاولات كبير، يرجى المحاولة لاحقاً.",
  NO_TEMPLATE: "التسجيل في هذا الصف غير متاح حالياً، تواصل مع إدارة المدرسة.",
  GRADE_AMOUNT_NOT_FOUND: "التسجيل في هذا الصف غير متاح حالياً، تواصل مع إدارة المدرسة.",
  INVALID_INPUT: "تحقق من البيانات المدخلة وأعد المحاولة.",
  CLASS_NOT_FOUND: "الصف المختار غير موجود.",
};

const errorMessage = (e) => {
  const code = e?.message || "";
  const key = Object.keys(ERRORS).find((k) => code.includes(k));
  return key ? ERRORS[key] : "حدث خطأ أثناء التسجيل، حاول مرة أخرى.";
};

const emptyForm = {
  name: "", parentName: "", phone: "", sex: "", educationLevel: "", grade: "", classId: "",
  driverName: "", driverPhone: "", driverRelation: "", website: "",
};

const Register = () => {
  const { schoolId } = useParams();
  const storageKey = `registeredStudents:${schoolId}`;

  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | notfound | ready
  const [saved, setSaved] = useState([]);
  const [view, setView] = useState("form"); // form | done | list
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastRecord, setLastRecord] = useState(null);
  const [copiedId, setCopiedId] = useState("");

  const country = info?.school?.country || "iraq";
  const schoolLogoUrl = info?.school?.logo_path ? publicUrl("school-logos", info.school.logo_path) : null;

  const load = useCallback(async () => {
    try {
      const data = await rpc("registration_form", { p_school: schoolId });
      if (!data) {
        setStatus("notfound");
        return;
      }
      setInfo(data);
      setStatus("ready");
    } catch (e) {
      console.error("Registration form failed:", e);
      setStatus("notfound");
    }
  }, [schoolId]);

  useEffect(() => {
    load();

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(stored) && stored.length) {
        setSaved(stored);
        setView("list");
      }
    } catch {}
  }, [load, storageKey]);

  const classes = useMemo(() => sortClasses(info?.classes || []), [info]);
  const levels = useMemo(() => [...new Set(classes.map((c) => c.education_level).filter(Boolean))], [classes]);
  const grades = useMemo(
    () => [...new Set(classes.filter((c) => c.education_level === form.educationLevel).map((c) => c.grade))],
    [classes, form.educationLevel]
  );
  const sections = useMemo(
    () => classes.filter((c) => c.education_level === form.educationLevel && c.grade === form.grade),
    [classes, form.educationLevel, form.grade]
  );

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setLevel = (e) => setForm((f) => ({ ...f, educationLevel: e.target.value, grade: "", classId: "" }));
  const setGrade = (e) => setForm((f) => ({ ...f, grade: e.target.value, classId: "" }));

  const phoneHint = country === "tunisia" ? "8 أرقام تبدأ بـ 2 أو 5 أو 9" : "مثال: 7712345678";
  const prefix = country === "tunisia" ? "+216" : "+964";

  const validate = () => {
    const required = [form.name, form.parentName, form.phone, form.sex, form.educationLevel, form.grade, form.classId,
      form.driverName, form.driverPhone, form.driverRelation];
    if (required.some((v) => !String(v).trim())) return "جميع الحقول إجبارية";
    if (form.name.trim().length < 3 || form.parentName.trim().length < 3 || form.driverName.trim().length < 3) return "الأسماء قصيرة جداً";
    if (!normalizePhone(form.phone, country)) return `رقم هاتف ولي الأمر غير صحيح (${phoneHint})`;
    if (!normalizePhone(form.driverPhone, country)) return `رقم هاتف السائق غير صحيح (${phoneHint})`;
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || form.website) return;

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const cls = classes.find((c) => c.id === form.classId);
      const phone = normalizePhone(form.phone, country);
      const driverPhone = normalizePhone(form.driverPhone, country);

      const id = await rpc("register_student", {
        p_school: schoolId,
        p_name: form.name,
        p_parent_name: form.parentName,
        p_phone: phone,
        p_sex: form.sex,
        p_class: form.classId,
        p_driver_name: form.driverName,
        p_driver_phone: driverPhone,
        p_driver_relation: form.driverRelation,
      });

      const record = {
        id,
        name: form.name.trim(),
        parentName: form.parentName.trim(),
        phone,
        educationLevel: cls?.education_level || "",
        className: cls?.name || "",
        year: info.year,
        driverName: form.driverName.trim(),
        driverPhone,
        driverRelation: form.driverRelation.trim(),
        createdAt: new Date().toISOString(),
      };

      const next = [...saved, record];
      setSaved(next);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}

      setLastRecord(record);
      setForm(emptyForm);
      setView("done");

      // The family gets the PDF straight away; the button below repeats it if the browser blocked the download
      downloadRegistrationPdf(record, { schoolName: info.school.name, schoolLogoUrl }).catch((err) =>
        console.error("Registration PDF failed:", err)
      );
    } catch (err) {
      console.error("Register student failed:", err);
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async (record) => {
    try {
      await navigator.clipboard.writeText(record.id);
      setCopiedId(record.id);
      setTimeout(() => setCopiedId(""), 2000);
    } catch {
      alert(record.id);
    }
  };

  const pdf = (record) =>
    downloadRegistrationPdf(record, { schoolName: info.school.name, schoolLogoUrl }).catch(() => alert("تعذر إنشاء ملف PDF"));

  const openForm = () => {
    setError("");
    setView("form");
  };

  const logos = (
    <div className="reg-logos">
      {schoolLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={schoolLogoUrl} alt="شعار المدرسة" />
      ) : <span />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo.png" alt="Safe" />
    </div>
  );

  if (status === "loading") {
    return <div className="loader-container"><ClipLoader color="#8a6115" size={50} /></div>;
  }

  if (status === "notfound") {
    return (
      <div className="reg-page">
        <div className="reg-card">
          <h2 className="reg-title">الرابط غير صحيح</h2>
          <p className="reg-muted">لم يتم العثور على المدرسة. تأكد من الرابط الذي استلمته من إدارة المدرسة.</p>
        </div>
      </div>
    );
  }

  const closed = !info.open;
  const unavailable = !closed && classes.length === 0;
  const canRegister = !closed && !unavailable;

  const registeredCards = (
    <div className="reg-list">
      {saved.map((r) => (
        <div key={r.id} className="reg-saved">
          <div className="reg-saved-head">
            <strong>{r.name}</strong>
            <span className="reg-badge">تم التسجيل بالفعل</span>
          </div>
          <p className="reg-muted">{r.className} - <bdi dir="ltr">{r.year}</bdi></p>
          <div className="reg-code" dir="ltr">{r.id}</div>
          <div className="reg-actions">
            <button type="button" className="create-submit" onClick={() => copyCode(r)}>
              {copiedId === r.id ? "تم النسخ" : "نسخ كود التفعيل"}
            </button>
            <button type="button" className="create-submit reg-secondary" onClick={() => pdf(r)}>تحميل PDF</button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="reg-page">
      <div className="reg-card" dir="rtl">
        {logos}
        <h2 className="reg-title">{info.school.name}</h2>
        <p className="reg-subtitle">استمارة تسجيل الطلاب - <bdi dir="ltr">{info.year}</bdi></p>

        {closed && <div className="reg-alert">التسجيل متوقف حالياً من قبل إدارة المدرسة.</div>}
        {unavailable && <div className="reg-alert">التسجيل غير متاح حالياً، تواصل مع إدارة المدرسة.</div>}

        {view === "done" && lastRecord && (
          <div className="reg-done">
            <div className="reg-success">تم تسجيل الطالب بنجاح</div>
            <p className="reg-student-name">{lastRecord.name}</p>
            <p className="reg-muted">{lastRecord.className}</p>

            <div className="reg-warning">
              مهم جداً: احتفظ بكود التفعيل التالي. تحتاجه لربط الطالب بحساب ولي الأمر في تطبيق Safe Student.
              تم تنزيل ملف PDF فيه بيانات الطالب والكود.
            </div>

            <div className="reg-code" dir="ltr">{lastRecord.id}</div>

            <div className="reg-actions">
              <button type="button" className="create-submit" onClick={() => copyCode(lastRecord)}>
                {copiedId === lastRecord.id ? "تم النسخ" : "نسخ كود التفعيل"}
              </button>
              <button type="button" className="create-submit reg-secondary" onClick={() => pdf(lastRecord)}>
                تحميل PDF مرة أخرى
              </button>
            </div>

            {canRegister && (
              <button type="button" className="create-submit reg-add" onClick={openForm}>
                + إضافة طالب آخر
              </button>
            )}
            {saved.length > 1 && (
              <button type="button" className="reg-link" onClick={() => setView("list")}>
                عرض كل الطلاب المسجلين ({saved.length})
              </button>
            )}
          </div>
        )}

        {view === "list" && (
          <>
            <p className="reg-muted">الطلاب التالية أسماؤهم تم تسجيلهم بالفعل من هذا الجهاز:</p>
            {registeredCards}
            {canRegister && (
              <button type="button" className="create-submit reg-add" onClick={openForm}>
                + إضافة طالب آخر
              </button>
            )}
          </>
        )}

        {view === "form" && canRegister && (
          <form className="reg-form" onSubmit={handleSubmit} noValidate>
            <h3 className="reg-section">بيانات الطالب</h3>

            <div className="input-group">
              <label>اسم الطالب</label>
              <input value={form.name} onChange={set("name")} maxLength={100} placeholder="الاسم الكامل للطالب" />
            </div>

            <div className="input-group">
              <label>اسم ولي الأمر</label>
              <input value={form.parentName} onChange={set("parentName")} maxLength={100} placeholder="الاسم الثلاثي لولي الأمر" />
            </div>

            <div className="input-group">
              <label>رقم هاتف ولي الأمر</label>
              <div className="reg-phone">
                <input dir="ltr" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder={phoneHint} maxLength={16} />
                <span dir="ltr">{prefix}</span>
              </div>
            </div>

            <div className="input-group">
              <label>الجنس</label>
              <select value={form.sex} onChange={set("sex")}>
                <option value="">اختر</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>

            <div className="input-group">
              <label>المرحلة الدراسية</label>
              <select value={form.educationLevel} onChange={setLevel}>
                <option value="">اختر المرحلة</option>
                {levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label>الصف</label>
              <select value={form.grade} onChange={setGrade} disabled={!form.educationLevel}>
                <option value="">اختر الصف</option>
                {grades.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label>الشعبة</label>
              <select value={form.classId} onChange={set("classId")} disabled={!form.grade}>
                <option value="">اختر الشعبة</option>
                {sections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.specialization, c.section].filter(Boolean).join(" - ")}
                  </option>
                ))}
              </select>
            </div>

            <h3 className="reg-section">بيانات السائق</h3>
            <p className="reg-muted reg-note">
              تُحفظ هذه البيانات كملاحظة للمدرسة، وتستخدمها لاحقاً لتنظيم خطوط النقل.
            </p>

            <div className="input-group">
              <label>اسم السائق</label>
              <input value={form.driverName} onChange={set("driverName")} maxLength={100} />
            </div>

            <div className="input-group">
              <label>رقم السائق</label>
              <div className="reg-phone">
                <input dir="ltr" inputMode="tel" value={form.driverPhone} onChange={set("driverPhone")} placeholder={phoneHint} maxLength={16} />
                <span dir="ltr">{prefix}</span>
              </div>
            </div>

            <div className="input-group">
              <label>صلة القرابة بالسائق</label>
              <input value={form.driverRelation} onChange={set("driverRelation")} maxLength={50} placeholder="مثال: أب، عم، جار، سائق خاص" />
            </div>

            {/* Hidden field that real users never see; bots that fill it are ignored */}
            <input
              className="reg-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
              value={form.website} onChange={set("website")}
            />

            {error && <p className="reg-error">{error}</p>}

            {submitting ? (
              <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
            ) : (
              <button type="submit" className="create-submit">تسجيل الطالب</button>
            )}

            {saved.length > 0 && (
              <button type="button" className="reg-link" onClick={() => setView("list")}>
                عرض الطلاب المسجلين ({saved.length})
              </button>
            )}
          </form>
        )}

        {view === "form" && !canRegister && saved.length > 0 && (
          <>
            <p className="reg-muted">الطلاب المسجلون من هذا الجهاز:</p>
            {registeredCards}
          </>
        )}
      </div>
    </div>
  );
};

export default Register;
