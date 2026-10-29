"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { supabase, driverRequests } from "../supabaseClient";
import { useGlobalState } from "../globalState";

const COLUMNS =
  "id, school_id, name, phone, car_type, car_plate, car_seats, personal_image_path, car_image_path, status, rejection_reason, created_at";

const FILTERS = [
  { key: "pending", label: "قيد المراجعة" },
  { key: "approved", label: "المقبولة" },
  { key: "rejected", label: "المرفوضة" },
];

const ERRORS = {
  not_pending: "تمت معالجة هذا الطلب مسبقاً",
  phone_in_use: "رقم الهاتف مسجل لسائق آخر بالفعل",
  login_in_use: "رقم الهاتف مسجل لسائق آخر بالفعل",
  forbidden: "غير مصرح لك بهذه العملية",
};

// Applications of the school's drivers: the admin accepts (creating the driver account) or rejects each one
const DriverRequests = ({ active, onPendingChange }) => {
  const { refresh } = useGlobalState();

  const [requests, setRequests] = useState([]);
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [busyId, setBusyId] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("driver_registrations")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      setRequests(data);
      onPendingChange?.(data.filter((r) => r.status === "pending").length);

      const paths = [...new Set(data.filter((r) => r.status !== "rejected").flatMap((r) => [r.personal_image_path, r.car_image_path]).filter(Boolean))];
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("driver-media").createSignedUrls(paths, 3600);
        setImages(Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])));
      }
    } catch (e) {
      console.error("Load driver requests failed:", e);
    } finally {
      setLoading(false);
    }
  }, [onPendingChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (request) => {
    if (!confirm(`هل تريد قبول السائق "${request.name}"؟ سيتم إنشاء حسابه وإضافته إلى سواق المدرسة`)) return;

    try {
      setBusyId(request.id);
      const result = await driverRequests({ action: "approve", requestId: request.id });
      setCredentials({ name: request.name, username: result.username, password: result.password });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      console.error(e);
      alert(ERRORS[e.message] || "حدث خطأ أثناء قبول الطلب");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    const request = rejecting;
    if (!request) return;

    try {
      setBusyId(request.id);
      await driverRequests({ action: "reject", requestId: request.id, reason: reason.trim() });
      setRejecting(null);
      setReason("");
      await load();
    } catch (e) {
      console.error(e);
      alert(ERRORS[e.message] || "حدث خطأ أثناء رفض الطلب");
      setRejecting(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const visible = requests.filter((r) => r.status === filter);
  const countOf = (key) => requests.filter((r) => r.status === key).length;

  return (
    <div style={{ display: active ? "block" : "none" }}>
      <div className="dr-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`dr-filter ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({countOf(f.key)})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loader"><ClipLoader size={30} color="#8a6115" /></div>
      ) : visible.length === 0 ? (
        <div className="empty">لا توجد طلبات</div>
      ) : (
        <div className="dr-list">
          {visible.map((r) => (
            <div key={r.id} className="dr-card">
              <div className="dr-images">
                {[r.personal_image_path, r.car_image_path].map((path, i) =>
                  images[path] ? (
                    <a key={path} href={images[path]} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={images[path]} alt={i === 0 ? "صورة السائق" : "صورة السيارة"} />
                    </a>
                  ) : (
                    <span key={path || i} className="dr-no-image">{r.status === "rejected" ? "محذوفة" : "-"}</span>
                  )
                )}
              </div>

              <div className="dr-info">
                <strong>{r.name}</strong>
                <span className="phone-number">{r.phone}</span>
                <span>{r.car_type} - {r.car_plate} - {r.car_seats} مقعد</span>
                <small>{new Date(r.created_at).toLocaleString("ar-IQ")}</small>
                {r.status === "rejected" && r.rejection_reason && <small>سبب الرفض: {r.rejection_reason}</small>}
              </div>

              {r.status === "pending" ? (
                <div className="dr-actions">
                  {busyId === r.id ? (
                    <ClipLoader size={18} color="#8a6115" />
                  ) : (
                    <>
                      <button className="create-btn" onClick={() => handleApprove(r)}>قبول</button>
                      <button className="delete-btn small" onClick={() => setRejecting(r)}>رفض</button>
                    </>
                  )}
                </div>
              ) : (
                <span className={`status-badge ${r.status === "approved" ? "paid" : "unpaid"}`}>
                  {r.status === "approved" ? "مقبول" : "مرفوض"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        title="رفض الطلب"
        open={!!rejecting}
        onCancel={() => { setRejecting(null); setReason(""); }}
        footer={null}
        centered
      >
        <div className="create-school-form">
          <p style={{ margin: 0 }}>رفض طلب السائق <strong>{rejecting?.name}</strong>؟ لن يعتبر مسجلاً.</p>
          <input
            placeholder="سبب الرفض (اختياري)"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
          {busyId === rejecting?.id ? (
            <div className="btn-loading"><ClipLoader size={15} color="#fff" /></div>
          ) : (
            <button className="create-submit" style={{ background: "#dc2626" }} onClick={handleReject}>
              تأكيد الرفض
            </button>
          )}
        </div>
      </Modal>

      <Modal
        title="تم قبول السائق"
        open={!!credentials}
        onCancel={() => setCredentials(null)}
        footer={null}
        centered
      >
        <div className="driver-credentials">
          <p>السائق: <strong>{credentials?.name}</strong></p>
          <p>رقم الدخول: <strong>{credentials?.username}</strong></p>
          <p>كلمة المرور: <strong>{credentials?.password}</strong></p>
          <p style={{ fontSize: 13 }}>
            يحصل السائق على هذه البيانات أيضاً من رابط الاستمارة الذي قدّم منه.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default DriverRequests;
