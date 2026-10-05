"use client";

import React, { useMemo, useState } from "react";
import { Modal } from "antd";
import { supabase } from "../../../supabaseClient";
import { useParams, useRouter } from "next/navigation";
import { useGlobalState } from "../../../globalState";
import ClipLoader from "react-spinners/ClipLoader";
import { IoArrowBackCircle } from "react-icons/io5";
import "../../style.css";

const LineDetails = () => {
  const { id } = useParams();
  const router = useRouter();
  const { lines, drivers, students, loading, refresh } = useGlobalState();
  const line = lines.find((l) => l.id === id);

  const [openDriverModal, setOpenDriverModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [searchDriver, setSearchDriver] = useState("");
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [openStudentModal, setOpenStudentModal] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchStudent, setSearchStudent] = useState("");
  const [loadingAddStudent, setLoadingAddStudent] = useState(false);
  const [loadingRemoveDriver, setLoadingRemoveDriver] = useState(false);
  const [loadingRemoveStudent, setLoadingRemoveStudent] = useState(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState(null);
  const [subscriptionInput, setSubscriptionInput] = useState("");
  const [savingSubscriptionId, setSavingSubscriptionId] = useState(null);

  const driver = useMemo(() => {
    if (!line) return null;
    return drivers.find((d) => d.id === line.driver_id) || null;
  }, [line, drivers]);

  const lineStudents = useMemo(() => {
    if (!line) return [];
    return students.filter((s) => s.line_id === line.id && !s.account_deleted);
  }, [students, line]);

  const totalSubscriptionAmount = useMemo(
    () => lineStudents.reduce((sum, s) => sum + (Number(s.subscription_amount) || 0), 0),
    [lineStudents]
  );

  const filteredDrivers = useMemo(
    () => drivers.filter((d) => !searchDriver || d.name?.includes(searchDriver)),
    [drivers, searchDriver]
  );

  const availableStudents = useMemo(() => {
    if (!line) return [];
    return students.filter(
      (s) =>
        s.school_id === line.school_id &&
        !s.line_id &&
        !s.account_deleted &&
        !s.graduated &&
        (!searchStudent || s.name?.includes(searchStudent))
    );
  }, [students, line, searchStudent]);

  const handleAssignDriver = async () => {
    if (!selectedDriver) {
      alert("اختر سائق");
      return;
    }

    if (line.driver_id) {
      alert("هذا الخط لديه سائق بالفعل");
      return;
    }

    try {
      setLoadingAssign(true);

      // Only a line without a driver is updated; its students follow the line's driver
      const { data, error } = await supabase
        .from("lines")
        .update({
          driver_id: selectedDriver.id,
          driver_name: selectedDriver.name,
          car_type: selectedDriver.car_type || null,
        })
        .eq("id", line.id)
        .is("driver_id", null)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        alert("تم تعيين سائق لهذا الخط مسبقاً");
        await refresh();
        return;
      }

      closeDriverModal();
      await refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء الربط");
    } finally {
      setLoadingAssign(false);
    }
  };

  const closeDriverModal = () => {
    setOpenDriverModal(false);
    setSelectedDriver(null);
  };

  // A student can ride only once a parent is linked and a home location is set
  const isStudentValid = (student) => student.linked_parent && student.home_location;

  const toggleStudentSelection = (student) => {
    setSelectedStudents((prev) =>
      prev.find((s) => s.id === student.id)
        ? prev.filter((s) => s.id !== student.id)
        : [...prev, student]
    );
  };

  const handleAddStudent = async () => {
    if (selectedStudents.length === 0) {
      alert("اختر طالب واحد على الأقل");
      return;
    }

    try {
      setLoadingAddStudent(true);

      // Only students without a line that already have a linked parent and home location
      const ids = selectedStudents.filter(isStudentValid).map((s) => s.id);

      if (ids.length) {
        const { error } = await supabase
          .from("students")
          .update({ line_id: line.id })
          .in("id", ids)
          .is("line_id", null)
          .not("linked_parent_id", "is", null)
          .not("home_lat", "is", null)
          .not("home_lng", "is", null);

        if (error) throw error;
      }

      closeStudentsModal();
      await refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء الإضافة");
    } finally {
      setLoadingAddStudent(false);
    }
  };

  const closeStudentsModal = () => {
    setOpenStudentModal(false);
    setSelectedStudents([]);
  };

  const startEditSubscription = (student) => {
    setEditingSubscriptionId(student.id);
    setSubscriptionInput(String(student.subscription_amount || ""));
  };

  const handleSaveSubscription = async (student) => {
    const amount = Number(subscriptionInput);

    if (!subscriptionInput.trim() || Number.isNaN(amount) || amount < 0) {
      alert("يرجى إدخال مبلغ صحيح");
      return;
    }

    try {
      setSavingSubscriptionId(student.id);

      const { error } = await supabase
        .from("students")
        .update({ subscription_amount: amount })
        .eq("id", student.id);

      if (error) throw error;

      setEditingSubscriptionId(null);
      await refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ مبلغ الاشتراك");
    } finally {
      setSavingSubscriptionId(null);
    }
  };

  const handleRemoveDriver = async () => {
    if (!line.driver_id) return;

    if (!confirm("هل تريد إزالة السائق من هذا الخط؟")) return;

    try {
      setLoadingRemoveDriver(true);

      const { error } = await supabase
        .from("lines")
        .update({ driver_id: null, driver_name: null, car_type: null })
        .eq("id", line.id);

      if (error) throw error;

      await refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء إزالة السائق");
    } finally {
      setLoadingRemoveDriver(false);
    }
  };

  const handleRemoveStudent = async (student) => {
    if (!confirm("هل تريد إزالة هذا الطالب من الخط؟")) return;

    try {
      setLoadingRemoveStudent(student.id);

      const { error } = await supabase
        .from("students")
        .update({ line_id: null })
        .eq("id", student.id);

      if (error) throw error;

      await refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء إزالة الطالب");
    } finally {
      setLoadingRemoveStudent(null);
    }
  };

  if (loading) {
    return (
      <div className="loader">
        <ClipLoader size={40} color="#8a6115" />
      </div>
    );
  }

  if (!line) {
    return <div className="empty">الخط غير موجود</div>;
  }

  const driverName = driver?.name || line.driver_name;

  return (
    <div className="line-details-container">
      <div className="back-btn" onClick={() => router.back()}>
        <IoArrowBackCircle size={26} />
      </div>

      <div className="line-details-card">
        <h2>{line.line_name || `خط: ${line.destination}`}</h2>
        <p>{line.line_number} {"رقم الخط"} · {line.destination}</p>
      </div>

      <div className="line-section">
        <div className="section-header">
          <h3>معلومات السائق</h3>
        </div>

        {line.driver_id ? (
          <div className="driver-box">
            {loadingRemoveDriver ? (
              <ClipLoader size={12} />
            ) : (
              <button className="delete-btn driver-remove-btn" onClick={handleRemoveDriver}>
                إزالة السائق
              </button>
            )}

            <div className="driver-info-grid">
              <div>
                <span>الاسم</span>
                <strong>{driverName || "-"}</strong>
              </div>

              <div>
                <span>الهاتف</span>
                <strong className="phone-number">{driver?.phone_number || "-"}</strong>
              </div>

              <div>
                <span>نوع السيارة</span>
                <strong>{driver?.car_type || line.car_type || "-"}</strong>
              </div>

              <div>
                <span>رقم اللوحة</span>
                <strong>{driver?.car_plate || "-"}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-with-action">
            <p style={{ color: "gray", fontSize: "15px" }}>لم يتم تعيين سائق لهذا الخط</p>
            <div className="create-btn" onClick={() => setOpenDriverModal(true)}>
              <p>تعيين سائق</p>
            </div>
          </div>
        )}
      </div>

      <Modal
        title="تعيين سائق"
        open={openDriverModal}
        onCancel={closeDriverModal}
        footer={null}
        centered
      >
        <div className="create-school-form">
          <input
            placeholder="بحث باسم السائق..."
            value={searchDriver}
            onChange={(e) => setSearchDriver(e.target.value)}
          />
          <div className="drivers-list">
            {filteredDrivers.length === 0 && (
              <div className="empty">لا يوجد سواق، أنشئ سائقاً من قسم السواق أولاً</div>
            )}
            {filteredDrivers.map((d) => (
              <div
                key={d.id}
                className={`driver-item ${selectedDriver?.id === d.id ? "active" : ""}`}
                onClick={() => setSelectedDriver(d)}
              >
                <p>{d.name}</p>
                <span className="phone-number">{d.phone_number}</span>
              </div>
            ))}
          </div>
          {loadingAssign ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button
              className={`create-submit ${!selectedDriver ? "disabled-button" : ""}`}
              onClick={handleAssignDriver}
              disabled={!selectedDriver}
            >
              ربط
            </button>
          )}
        </div>
      </Modal>

      <div className="line-section">
        <div className="section-header">
          <h3>الطلاب ({lineStudents.length})</h3>
          <div className="create-btn" onClick={() => setOpenStudentModal(true)}>
            <p>+ إضافة طلاب</p>
          </div>
        </div>

        {lineStudents.length > 0 && (
          <p style={{ color: "gray", fontSize: "14px", marginTop: "-8px" }}>
            إجمالي الاشتراكات الشهرية: <strong>{totalSubscriptionAmount.toLocaleString("ar-IQ")} د.ع</strong>
          </p>
        )}

        {lineStudents.length === 0 ? (
          <div className="empty">لا يوجد طلاب في هذا الخط</div>
        ) : (
          <div className="line-table">
            <div className="line-table-header line-details-student-list-item">
              <span>اسم الطالب</span>
              <span>رقم الهاتف</span>
              <span>تكلفة الاشتراك</span>
              <div></div>
            </div>

            {lineStudents.map((student) => (
              <div key={student.id} className="line-table-row line-details-student-list-item">
                <span>{student.name} {student.parent_name}</span>
                <span className="phone-number">{student.phone_number}</span>
                <span>
                  {editingSubscriptionId === student.id ? (
                    <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="number"
                        min="0"
                        value={subscriptionInput}
                        onChange={(e) => setSubscriptionInput(e.target.value)}
                        style={{ width: "90px", padding: "4px 8px" }}
                      />
                      {savingSubscriptionId === student.id ? (
                        <ClipLoader size={12} />
                      ) : (
                        <button
                          className="create-btn"
                          style={{ height: "26px", padding: "0 10px" }}
                          onClick={() => handleSaveSubscription(student)}
                        >
                          <p style={{ margin: 0 }}>حفظ</p>
                        </button>
                      )}
                    </span>
                  ) : (
                    <span
                      style={{ cursor: "pointer", textDecoration: "underline dotted" }}
                      onClick={() => startEditSubscription(student)}
                    >
                      {student.subscription_amount
                        ? `${Number(student.subscription_amount).toLocaleString("ar-IQ")} د.ع`
                        : "— تحديد —"}
                    </span>
                  )}
                </span>
                <div style={{ textAlign: "center" }}>
                  {loadingRemoveStudent === student.id ? (
                    <ClipLoader size={12} />
                  ) : (
                    <button className="delete-btn small" onClick={() => handleRemoveStudent(student)}>
                      إزالة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <Modal
          title="إضافة طالب"
          open={openStudentModal}
          onCancel={closeStudentsModal}
          footer={null}
          centered
        >
          <div className="create-school-form">
            <input
              placeholder="بحث باسم الطالب..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
            />

            <div className="drivers-list">
              {availableStudents.map((s) => {
                const isValid = isStudentValid(s);

                return (
                  <div
                    key={s.id}
                    className={`driver-item ${selectedStudents.find((st) => st.id === s.id) ? "active" : ""} ${!isValid ? "disabled-item" : ""}`}
                    onClick={() => {
                      if (!isValid) return;
                      toggleStudentSelection(s);
                    }}
                  >
                    <p>{s.name} {s.parent_name}</p>
                    <span className="phone-number">
                      {isValid ? s.phone_number : "غير مرتبط بحساب ولي"}
                    </span>
                  </div>
                );
              })}
            </div>

            {loadingAddStudent ? (
              <div className="btn-loading">
                <ClipLoader size={15} color="#fff" />
              </div>
            ) : (
              <button
                className={`create-submit ${selectedStudents.length === 0 ? "disabled-button" : ""}`}
                onClick={handleAddStudent}
                disabled={selectedStudents.length === 0}
              >
                إضافة ({selectedStudents.length})
              </button>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default LineDetails;
