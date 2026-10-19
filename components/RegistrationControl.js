"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { rpc } from "../supabaseClient";
import { useGlobalState } from "../globalState";

// Link of the public registration form and the admin's switch to open or stop it
const RegistrationControl = ({ open, onClose }) => {
  const { classes } = useGlobalState();

  const [schoolId, setSchoolId] = useState("");
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (id) => {
    try {
      setLoading(true);
      setForm(await rpc("registration_form", { p_school: id }));
    } catch (e) {
      console.error("Load registration form failed:", e);
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

  const link = schoolId && typeof window !== "undefined" ? `${window.location.origin}/register/${schoolId}` : "";
  const isOpen = !!form?.open;
  const availableClasses = form?.classes?.length || 0;

  const toggle = async () => {
    try {
      setSaving(true);
      await rpc("set_registration_open", { p_school: schoolId, p_open: !isOpen });
      await load(schoolId);
    } catch (e) {
      console.error("Toggle registration failed:", e);
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
    <Modal title="استمارة تسجيل الطلاب" open={open} onCancel={onClose} footer={null} centered>
      <div className="create-school-form">
        {loading || !form ? (
          <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
              أرسل هذا الرابط لأولياء الأمور. يملأ الولي الاستمارة، فيُنشأ الطالب مباشرة ويظهر له كود التفعيل.
            </p>

            <div className="input-group">
              <label>رابط الاستمارة</label>
              <input readOnly dir="ltr" value={link} onFocus={(e) => e.target.select()} />
            </div>

            <button className="create-submit" onClick={copy}>{copied ? "تم النسخ" : "نسخ الرابط"}</button>

            <p style={{ margin: 0, fontWeight: 700, color: isOpen ? "var(--green-text)" : "var(--red-text)" }}>
              الحالة: {isOpen ? "التسجيل مفتوح" : "التسجيل متوقف"}
            </p>

            {availableClasses === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--amber-text)", lineHeight: 1.8 }}>
                لا يوجد صف جاهز للتسجيل في السنة {form.year}. أنشئ الفاتورة السنوية وحدد مبلغ كل صف حتى تظهر الصفوف في الاستمارة.
              </p>
            )}
            {availableClasses > 0 && availableClasses < classes.length && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--amber-text)", lineHeight: 1.8 }}>
                {classes.length - availableClasses} صف لا يظهر في الاستمارة لأن مبلغه غير محدد في الفاتورة السنوية.
              </p>
            )}

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

export default RegistrationControl;
