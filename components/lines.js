"use client";

import React, { useState, useMemo } from "react";
import { query, collection, orderBy, limit, getDocs, getDoc, doc, addDoc } from "firebase/firestore";
import { DB } from "../firebaseConfig";
import { useGlobalState } from "../globalState";
import ClipLoader from "react-spinners/ClipLoader";
import { useRouter } from "next/navigation";
import { Modal } from "antd";
import "../app/style.css";

const lineNumberValue = (line) => parseInt(line.line_number?.replace("L", "")) || 0;

const Lines = () => {
  const { lines, drivers, loading, refresh } = useGlobalState();
  const router = useRouter();

  const [nameFilter, setNameFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("all");
  const [openModal, setOpenModal] = useState(false);
  const [newLineName, setNewLineName] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);

  const driverById = useMemo(
    () => new Map(drivers.map((d) => [d.id, d])),
    [drivers]
  );

  const filteredLines = useMemo(() => {
    const term = nameFilter.trim();

    return lines
      .filter((line) => {
        if (term) {
          const driverName = driverById.get(line.driver_id)?.name || line.driver_name || "";
          const matches =
            line.line_number?.includes(term) ||
            line.line_name?.includes(term) ||
            driverName.includes(term);
          if (!matches) return false;
        }

        if (driverFilter === "yes" && !line.driver_id) return false;
        if (driverFilter === "no" && line.driver_id) return false;

        return true;
      })
      .sort((a, b) => lineNumberValue(a) - lineNumberValue(b));
  }, [lines, nameFilter, driverFilter, driverById]);

  const linesWithDriver = useMemo(
    () => lines.filter((l) => l.driver_id).length,
    [lines]
  );

  const closeCreateModal = () => {
    setOpenModal(false);
    setNewLineName("");
  };

  // Line numbers are shared by every school, so the next one is read from all lines
  const getNextLineNumber = async () => {
    const snap = await getDocs(
      query(collection(DB, "lines"), orderBy("line_number", "desc"), limit(1))
    );

    if (snap.empty) return "L001";

    const last = parseInt(snap.docs[0].data().line_number.replace("L", ""));
    return `L${String(last + 1).padStart(3, "0")}`;
  };

  const handleCreateLine = async () => {
    const schoolId = localStorage.getItem("adminSchoolID");

    if (!schoolId || schoolId === "ALL") {
      alert("يرجى الدخول بحساب مدرسة لإنشاء خط");
      return;
    }

    try {
      setLoadingCreate(true);

      const schoolSnap = await getDoc(doc(DB, "schools", schoolId));
      if (!schoolSnap.exists()) {
        alert("لم يتم العثور على بيانات المدرسة");
        return;
      }

      const school = schoolSnap.data();
      const lineNumber = await getNextLineNumber();

      await addDoc(collection(DB, "lines"), {
        line_number: lineNumber,
        line_name: newLineName.trim() || `خط ${lines.length + 1}`,
        destination: school.name,
        destination_location: school.location || null,
        school_id: schoolId,
        driver_id: null,
        driver_name: null,
        car_type: null,
        riders: [],
        created_at: new Date(),
      });

      closeCreateModal();
      refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء إنشاء الخط");
    } finally {
      setLoadingCreate(false);
    }
  };

  return (
    <div className="students-container">
      <div className="students-header">
        <h2>الخطوط</h2>
        <div className="create-btn" onClick={() => setOpenModal(true)}>
          <p>+ إنشاء خط جديد</p>
        </div>
      </div>

      <Modal
        title="إنشاء خط جديد"
        open={openModal}
        onCancel={closeCreateModal}
        footer={null}
        centered
      >
        <div className="create-school-form">
          <input
            placeholder="اسم الخط (مثال: الخط الشمالي) - اختياري"
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
          />

          <p className="modal-hint">
            يمكن للمدرسة امتلاك أكثر من خط، ولكل خط سائق خاص به.
          </p>

          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateLine}>
              إنشاء
            </button>
          )}
        </div>
      </Modal>

      <div className="lines-summary">
        <span>إجمالي الخطوط: <strong>{lines.length}</strong></span>
        <span>لها سائق: <strong>{linesWithDriver}</strong></span>
        <span>بلا سائق: <strong>{lines.length - linesWithDriver}</strong></span>
      </div>

      <div className="students-filters">
        <input
          placeholder="البحث برقم الخط أو اسمه أو السائق..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
          <option value="all">السائق</option>
          <option value="yes">نعم</option>
          <option value="no">لا</option>
        </select>
      </div>

      <div className="lines-table">
        <div className="lines-table-header">
          <span>رقم الخط</span>
          <span>اسم الخط</span>
          <span>السائق</span>
          <span>عدد الطلاب</span>
          <span>الحالة</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="empty">لا يوجد خطوط</div>
        ) : (
          filteredLines.map((line) => {
            const lineDriver = driverById.get(line.driver_id);
            const driverName = lineDriver?.name || line.driver_name;

            return (
              <div
                key={line.id}
                className="lines-table-row"
                onClick={() => router.push(`/lines/${line.id}`)}
              >
                <span className="line-number-cell">{line.line_number}</span>

                <span className="line-destination-cell">
                  <strong>{line.line_name || line.destination || "-"}</strong>
                  <small>{line.destination}</small>
                </span>

                <span>
                  {driverName ? (
                    <span className="driver-chip">
                      {lineDriver?.personal_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lineDriver.personal_image} alt={driverName} />
                      ) : (
                        <span className="driver-avatar-placeholder small">
                          {driverName.trim().charAt(0) || "؟"}
                        </span>
                      )}
                      <span className="driver-chip-text">
                        <strong>{driverName}</strong>
                        <small>{lineDriver?.car_type || line.car_type || lineDriver?.phone_number}</small>
                      </span>
                    </span>
                  ) : (
                    <span className="no-driver-text">بدون سائق</span>
                  )}
                </span>

                <span>{line.riders?.length || 0}</span>

                <span>
                  {line.driver_id ? (
                    <span className="assigned-badge">نشط</span>
                  ) : (
                    <span className="pending-badge">بانتظار سائق</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Lines;
