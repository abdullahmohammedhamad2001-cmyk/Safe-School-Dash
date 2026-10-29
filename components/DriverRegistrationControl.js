"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { rpc } from "../supabaseClient";

// Link of the school's public driver registration form and the switch that opens or stops it
const DriverRegistrationControl = ({ open, onClose }) => {
  const [schoolId, setSchoolId] = useState("");
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (id) => {
    try {
      setLoading(true);
      setForm(await rpc("driver_registration_form", { p_school: id }));
    } catch (e) {
      console.error("Load driver registration form failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = localStorage.getItem("adminSchoolID") || "";
    setSchoolId(id);
    if (id && id !== "ALL") load(id);
  }, [open, load]);

  const link = schoolId && schoolId !== "ALL" && typeof window !== "undefined"
    ? `${window.location.origin}/driver-register/${schoolId}`
    : "";
  const isOpen = !!form?.open;

  const toggle = async () => {
    try {
      setSaving(true);
      await rpc("set_driver_registration_open", { p_school: schoolId, p_open: !isOpen });
      await load(schoolId);
    } catch (e) {
      console.error("Toggle driver registration failed:", e);
      alert("تعذر تغيير حالة التسجيل");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(link);
    }
  };

  return (
    <Modal title="استمارة تسجيل السائقين" open={open} onCancel={onClose} footer={null} centered>
      <div className="create-school-form">
        {!link ? (
          <p style={{ margin: 0, color: "var(--red-text)" }}>يرجى الدخول بحساب مدرسة.</p>
        ) : loading || !form ? (
          <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
              أرسل هذا الرابط للسائقين. يملأ السائق الاستمارة، ثم تقبل الطلب أو ترفضه من تبويب «طلبات التسجيل».
              عند القبول يحصل السائق على رقم الدخول وكلمة المرور من الرابط نفسه.
            </p>

            <div className="input-group">
              <label>رابط الاستمارة</label>
              <input readOnly dir="ltr" value={link} onFocus={(e) => e.target.select()} />
            </div>

            <button className="create-submit" onClick={copy}>{copied ? "تم النسخ" : "نسخ الرابط"}</button>

            <p style={{ margin: 0, fontWeight: 700, color: isOpen ? "var(--green-text)" : "var(--red-text)" }}>
              الحالة: {isOpen ? "التسجيل مفتوح" : "التسجيل متوقف"}
            </p>

            {saving ? (
              <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
            ) : (
              <button
                className="create-submit"
                style={{ background: isOpen ? "#dc2626" : "#15803d" }}
                onClick={toggle}
              >
                {isOpen ? "إيقاف التسجيل" : "تشغيل التسجيل"}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default DriverRegistrationControl;
