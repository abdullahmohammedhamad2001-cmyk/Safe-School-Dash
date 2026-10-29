"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { rpc, publicUrl, imageError, submitDriverRegistration } from "../../../supabaseClient";
import "../../style.css";

const CAR_TYPES = [
  "صالون",
  "ميني باص ١٢ راكب",
  "ميني باص ١٨ راكب",
  "٧ راكب (جي ام سي / تاهو)",
];

const ERRORS = {
  registration_closed: "التسجيل متوقف حالياً من قبل إدارة المدرسة.",
  phone_in_use: "رقم الهاتف مسجل لسائق آخر. إذا كان رقمك فتواصل مع إدارة المدرسة.",
  already_pending: "لديك طلب قيد المراجعة بهذا الرقم.",
  rate_limited: "عدد المحاولات كبير، يرجى المحاولة لاحقاً.",
  invalid_phone: "رقم الهاتف غير صحيح (مثال: 7712345678).",
  invalid_image: "الصورة غير صالحة. استخدم صورة JPG أو PNG أو WEBP لا يتجاوز حجمها 5 ميغابايت.",
  invalid_input: "تحقق من البيانات المدخلة وأعد المحاولة.",
  school_not_found: "لم يتم العثور على المدرسة.",
};

const errorMessage = (e) => ERRORS[e?.message] || "حدث خطأ أثناء إرسال الطلب، حاول مرة أخرى.";

// Iraqi mobile number: 10 digits starting with 7 (a leading 0 or 964 is accepted)
const normalizePhone = (value) => {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("964")) d = d.slice(3);
  if (d.startsWith("07")) d = d.slice(1);
  return /^7\d{9}$/.test(d) ? d : null;
};

const emptyForm = { name: "", phone: "", carType: "", carPlate: "", carSeats: "", website: "" };

const MAX_SIDE = 1600;

// Phone cameras produce photos over the upload limit, so they are shrunk in the browser; the original is kept if it can't be decoded
const shrinkImage = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });

// Gallery and camera are separate buttons: a label opens the hidden input reliably on phones, unlike a styled native file field
const ImagePicker = ({ label, file, onChange, facing }) => {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = async (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (chosen) onChange(await shrinkImage(chosen));
  };

  return (
    <div className="input-group">
      <label>{label}</label>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="reg-file-preview" src={preview} alt={label} />
      )}
      <div className="reg-file-actions">
        <label className="reg-file-btn">
          <input type="file" accept="image/*" onChange={pick} />
          {file ? "تغيير من المعرض" : "اختيار من المعرض"}
        </label>
        <label className="reg-file-btn">
          <input type="file" accept="image/*" capture={facing} onChange={pick} />
          التقاط صورة
        </label>
      </div>
    </div>
  );
};

const DriverRegister = () => {
  const { schoolId } = useParams();
  const tokenKey = `driverRegistration:${schoolId}`;

  const [info, setInfo] = useState(null);
  const [pageState, setPageState] = useState("loading"); // loading | notfound | ready
  const [token, setToken] = useState("");
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [personalImage, setPersonalImage] = useState(null);
  const [carImage, setCarImage] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState("");

  const schoolLogoUrl = info?.school?.logo_path ? publicUrl("school-logos", info.school.logo_path) : null;

  const loadRequest = useCallback(async (t) => {
    if (!t) {
      setRequest(null);
      return;
    }
    try {
      const data = await rpc("driver_registration_status", { p_token: t });
      if (!data) {
        // A link that no longer matches any request is forgotten
        try { localStorage.removeItem(tokenKey); } catch {}
        setToken("");
        setRequest(null);
        return;
      }
      setRequest(data);
    } catch (e) {
      console.error("Driver registration status failed:", e);
    }
  }, [tokenKey]);

  useEffect(() => {
    const init = async () => {
      try {
        const data = await rpc("driver_registration_form", { p_school: schoolId });
        if (!data) {
          setPageState("notfound");
          return;
        }
        setInfo(data);

        // The personal link carries the token; otherwise the one saved on this device is used
        let t = new URLSearchParams(window.location.search).get("t") || "";
        if (!t) {
          try { t = localStorage.getItem(tokenKey) || ""; } catch {}
        }
        if (t) {
          try { localStorage.setItem(tokenKey, t); } catch {}
          setToken(t);
          await loadRequest(t);
        }
        setPageState("ready");
      } catch (e) {
        console.error("Driver registration form failed:", e);
        setPageState("notfound");
      }
    };
    init();
  }, [schoolId, tokenKey, loadRequest]);

  // While the school has not answered yet the page checks again by itself
  useEffect(() => {
    if (!token || request?.status !== "pending") return;
    const timer = setInterval(() => loadRequest(token), 30000);
    return () => clearInterval(timer);
  }, [token, request?.status, loadRequest]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    if (!form.name.trim() || !form.phone.trim() || !form.carType || !form.carPlate.trim() || !form.carSeats || !personalImage || !carImage) {
      return "جميع الحقول إجبارية";
    }
    if (form.name.trim().length < 3) return "الاسم قصير جداً";
    if (!normalizePhone(form.phone)) return ERRORS.invalid_phone;
    const seats = Number(form.carSeats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 100) return "عدد المقاعد غير صحيح";
    return imageError(personalImage) || imageError(carImage) || "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const body = new FormData();
      body.append("school", schoolId);
      body.append("name", form.name.trim());
      body.append("phone", normalizePhone(form.phone));
      body.append("car_type", form.carType);
      body.append("car_plate", form.carPlate.trim());
      body.append("car_seats", String(Number(form.carSeats)));
      body.append("website", form.website);
      body.append("personal_image", personalImage);
      body.append("car_image", carImage);

      const result = await submitDriverRegistration(body);

      try { localStorage.setItem(tokenKey, result.token); } catch {}
      setToken(result.token);
      setForm(emptyForm);
      setPersonalImage(null);
      setCarImage(null);
      await loadRequest(result.token);
    } catch (err) {
      console.error("Driver registration failed:", err);
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadRequest(token);
    setRefreshing(false);
  };

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      alert(text);
    }
  };

  const confirmSaved = async () => {
    if (!confirm("بعد التأكيد لن تظهر كلمة المرور مرة أخرى. هل حفظتها؟")) return;
    try {
      await rpc("driver_registration_ack", { p_token: token });
      await loadRequest(token);
    } catch (e) {
      console.error("Driver registration ack failed:", e);
      alert("تعذر إتمام العملية");
    }
  };

  const applyAgain = () => {
    try { localStorage.removeItem(tokenKey); } catch {}
    setToken("");
    setRequest(null);
    setError("");
  };

  const statusLink = token && typeof window !== "undefined" ? `${window.location.origin}/driver-register/${schoolId}?t=${token}` : "";

  if (pageState === "loading") {
    return <div className="loader-container"><ClipLoader color="#8a6115" size={50} /></div>;
  }

  if (pageState === "notfound") {
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

  const statusView = request && (
    <div className="reg-done">
      <p className="reg-student-name">{request.name}</p>
      <p className="reg-muted" dir="ltr">{request.phone}</p>

      {request.status === "pending" && (
        <>
          <div className="reg-alert">طلبك قيد المراجعة من إدارة المدرسة</div>
          <p className="reg-muted">
            لا تعتبر مسجلاً حتى يتم قبول طلبك. ارجع إلى هذا الرابط لاحقاً لمعرفة النتيجة والحصول على بيانات الدخول.
          </p>
          {refreshing ? (
            <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
          ) : (
            <button type="button" className="create-submit" onClick={refresh}>تحديث الحالة</button>
          )}
        </>
      )}

      {request.status === "approved" && (
        <>
          <div className="reg-success">تم قبول طلبك وأنت الآن مسجل سائق</div>

          {request.credentials ? (
            <>
              <div className="reg-warning">
                مهم جداً: احفظ بيانات الدخول التالية، تحتاجها لتسجيل الدخول إلى تطبيق Safe Drive.
              </div>
              <p className="reg-muted">رقم الدخول</p>
              <div className="reg-code" dir="ltr">{request.credentials.username}</div>
              <p className="reg-muted">كلمة المرور</p>
              <div className="reg-code" dir="ltr">{request.credentials.password}</div>
              <div className="reg-actions">
                <button
                  type="button" className="create-submit"
                  onClick={() => copy("cred", `${request.credentials.username}\n${request.credentials.password}`)}
                >
                  {copied === "cred" ? "تم النسخ" : "نسخ بيانات الدخول"}
                </button>
                <button type="button" className="create-submit reg-secondary" onClick={confirmSaved}>
                  حفظت البيانات
                </button>
              </div>
            </>
          ) : (
            <p className="reg-muted">
              سجّل الدخول في تطبيق Safe Drive برقم الدخول <bdi dir="ltr">{request.phone}</bdi> وكلمة المرور التي استلمتها.
              إذا فقدتها فتواصل مع إدارة المدرسة لإصدار كلمة مرور جديدة.
            </p>
          )}
        </>
      )}

      {request.status === "rejected" && (
        <>
          <div className="reg-warning">تم رفض طلبك، ولا تعتبر مسجلاً</div>
          {request.rejection_reason && <p className="reg-muted">السبب: {request.rejection_reason}</p>}
          {!closed && (
            <button type="button" className="create-submit reg-add" onClick={applyAgain}>
              تقديم طلب جديد
            </button>
          )}
        </>
      )}

      <button type="button" className="reg-link" onClick={() => copy("link", statusLink)}>
        {copied === "link" ? "تم نسخ الرابط" : "نسخ رابط متابعة طلبي"}
      </button>
    </div>
  );

  return (
    <div className="reg-page">
      <div className="reg-card" dir="rtl">
        {logos}
        <h2 className="reg-title">{info.school.name}</h2>
        <p className="reg-subtitle">استمارة تسجيل السائقين</p>

        {request ? (
          statusView
        ) : closed ? (
          <div className="reg-alert">التسجيل متوقف حالياً من قبل إدارة المدرسة.</div>
        ) : (
          <form className="reg-form" onSubmit={handleSubmit} noValidate>
            <h3 className="reg-section">بيانات السائق</h3>

            <div className="input-group">
              <label>الاسم</label>
              <input value={form.name} onChange={set("name")} maxLength={100} placeholder="الاسم الثلاثي" />
            </div>

            <div className="input-group">
              <label>رقم الهاتف</label>
              <div className="reg-phone">
                <input dir="ltr" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="مثال: 7712345678" maxLength={16} />
                <span dir="ltr">+964</span>
              </div>
            </div>

            <ImagePicker label="صورة السائق" file={personalImage} onChange={setPersonalImage} facing="user" />

            <h3 className="reg-section">بيانات السيارة</h3>

            <div className="input-group">
              <label>نوع السيارة</label>
              <select value={form.carType} onChange={set("carType")}>
                <option value="">اختر نوع السيارة</option>
                {CAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label>لوحة السيارة</label>
              <input value={form.carPlate} onChange={set("carPlate")} maxLength={30} />
            </div>

            <div className="input-group">
              <label>عدد المقاعد</label>
              <input type="number" min={1} max={100} value={form.carSeats} onChange={set("carSeats")} />
            </div>

            <ImagePicker label="صورة السيارة" file={carImage} onChange={setCarImage} facing="environment" />

            {/* Hidden field that real users never see; bots that fill it are rejected */}
            <input
              className="reg-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
              value={form.website} onChange={set("website")}
            />

            {error && <p className="reg-error">{error}</p>}

            {submitting ? (
              <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
            ) : (
              <button type="submit" className="create-submit">إرسال الطلب</button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default DriverRegister;
