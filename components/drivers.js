"use client";

import React, { useState, useMemo } from "react";
import { supabase, adminAccounts, storageName, imageError } from "../supabaseClient";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import "../app/style.css";

const CAR_TYPES = [
  "صالون",
  "ميني باص ١٢ راكب",
  "ميني باص ١٨ راكب",
  "٧ راكب (جي ام سي / تاهو)",
];

// Iraqi mobile → 10 digits starting with 7
const normalizePhone = (phone) => {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("07")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("7") || cleaned.length !== 10) return null;
  return cleaned;
};

const Drivers = () => {
  const { drivers, lines, loading, refresh } = useGlobalState();
  const router = useRouter();

  const [nameFilter, setNameFilter] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverPhoneNumber, setDriverPhoneNumber] = useState("");
  const [driverCarType, setDriverCarType] = useState("");
  const [driverCarPlate, setDriverCarPlate] = useState("");
  const [driverCarSeats, setDriverCarSeats] = useState("");
  const [driverPersonalImageFile, setDriverPersonalImageFile] = useState(null);
  const [driverCarImageFile, setDriverCarImageFile] = useState(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [newDriverCredentials, setNewDriverCredentials] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const filteredDrivers = useMemo(
    () => drivers.filter((d) => !nameFilter || d.name?.includes(nameFilter)),
    [drivers, nameFilter]
  );

  const linesCountByDriver = useMemo(() => {
    const map = {};
    lines.forEach((l) => {
      if (l.driver_id) map[l.driver_id] = (map[l.driver_id] || 0) + 1;
    });
    return map;
  }, [lines]);

  const resetForm = () => {
    setDriverName("");
    setDriverPhoneNumber("");
    setDriverCarType("");
    setDriverCarPlate("");
    setDriverCarSeats("");
    setDriverPersonalImageFile(null);
    setDriverCarImageFile(null);
  };

  const closeCreateModal = () => {
    setOpenModal(false);
    resetForm();
  };

  const handleCreateDriver = async () => {
    const schoolId = localStorage.getItem("adminSchoolID");

    if (!schoolId || schoolId === "ALL") {
      alert("يرجى الدخول بحساب مدرسة لإنشاء سائق");
      return;
    }

    if (!driverName.trim() || !driverPhoneNumber || !driverCarType || !driverCarPlate.trim() || !driverCarSeats || !driverPersonalImageFile || !driverCarImageFile) {
      alert("يرجى ملء جميع الحقول");
      return;
    }

    if (Number(driverCarSeats) <= 0) {
      alert("عدد المقاعد يجب أن يكون أكبر من 0");
      return;
    }

    const imageProblem = imageError(driverPersonalImageFile) || imageError(driverCarImageFile);
    if (imageProblem) {
      alert(imageProblem);
      return;
    }

    const normalizedPhone = normalizePhone(driverPhoneNumber);
    if (!normalizedPhone) {
      alert("رقم الهاتف غير صالح (يجب أن يبدأ بـ 7 ويكون 10 أرقام)");
      return;
    }

    const uploadedPaths = [];
    const media = supabase.storage.from("driver-media");

    try {
      setLoadingCreate(true);

      // Phone number is the driver id, so it must be unique
      if (drivers.some((d) => d.id === normalizedPhone)) {
        alert("رقم الهاتف مستخدم بالفعل");
        return;
      }

      const upload = async (prefix, file) => {
        const path = `${normalizedPhone}/${prefix}_${storageName(file)}`;
        const { error } = await media.upload(path, file, { contentType: file.type });
        if (error) throw error;
        uploadedPaths.push(path);
        return path;
      };

      const personalPath = await upload("personal", driverPersonalImageFile);
      const carPath = await upload("car", driverCarImageFile);

      // The login account and driver record are created server-side; the password is shown once
      const result = await adminAccounts({
        action: "create_driver",
        schoolId,
        name: driverName.trim(),
        phone: normalizedPhone,
        car_type: driverCarType,
        car_plate: driverCarPlate.trim(),
        car_seats: Number(driverCarSeats),
        personal_image_path: personalPath,
        car_image_path: carPath,
      });

      setNewDriverCredentials({ username: result.username, password: result.password });
      closeCreateModal();
      await refresh();
    } catch (error) {
      console.error(error);

      // Do not leave orphaned images behind
      if (uploadedPaths.length) await media.remove(uploadedPaths);

      alert(
        error.message === "phone_in_use" || error.message === "login_in_use"
          ? "رقم الهاتف مستخدم بالفعل"
          : "حدث خطأ أثناء إنشاء السائق"
      );
    } finally {
      setLoadingCreate(false);
    }
  };

  // Passwords are no longer stored in readable form; this issues a new one
  const handleResetPassword = async (driver) => {
    if (!confirm(`هل تريد إنشاء كلمة مرور جديدة للسائق "${driver.name}"؟`)) return;

    try {
      setDeletingId(driver.id);

      const result = await adminAccounts({ action: "reset_password", profileId: driver.profile_id });

      setNewDriverCredentials({ username: result.username, password: result.password });
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteDriver = async (driver) => {
    if (!confirm(`هل تريد حذف السائق "${driver.name}" نهائياً؟ سيتم حذف جميع بياناته وإخراجه من التطبيق`)) return;

    try {
      setDeletingId(driver.id);

      // Releases the driver's lines, removes images, the record and the login account
      await adminAccounts({ action: "delete_driver", driverId: driver.id });

      await refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حذف السائق");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="students-container">
      <div className="students-header">
        <h2>السواق</h2>
        <div className="create-btn" onClick={() => setOpenModal(true)}>
          <p>+ إنشاء حساب سائق</p>
        </div>
      </div>

      <Modal
        title="إنشاء حساب سائق"
        open={openModal}
        onCancel={closeCreateModal}
        footer={null}
        centered
      >
        <div className="create-school-form">
          <input
            placeholder="الاسم"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />

          <input
            placeholder="رقم الهاتف"
            value={driverPhoneNumber}
            onChange={(e) => setDriverPhoneNumber(e.target.value)}
          />

          <div className="driver-image-input">
            <p>صورة السائق</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setDriverPersonalImageFile(e.target.files[0] || null)}
            />
          </div>

          <select value={driverCarType} onChange={(e) => setDriverCarType(e.target.value)}>
            <option value="">نوع السيارة</option>
            {CAR_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <input
            placeholder="لوحة السيارة"
            value={driverCarPlate}
            onChange={(e) => setDriverCarPlate(e.target.value)}
          />

          <input
            type="number"
            placeholder="عدد المقاعد"
            value={driverCarSeats}
            onChange={(e) => setDriverCarSeats(e.target.value)}
          />

          <div className="driver-image-input">
            <p>صورة السيارة</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setDriverCarImageFile(e.target.files[0] || null)}
            />
          </div>

          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateDriver}>
              إنشاء
            </button>
          )}
        </div>
      </Modal>

      <Modal
        title="بيانات دخول السائق"
        open={!!newDriverCredentials}
        onCancel={() => setNewDriverCredentials(null)}
        footer={null}
        centered
      >
        <div className="driver-credentials">
          <p>رقم الدخول: <strong>{newDriverCredentials?.username}</strong></p>
          <p>كلمة المرور: <strong>{newDriverCredentials?.password}</strong></p>
        </div>
      </Modal>

      <div className="students-filters">
        <input
          placeholder="البحث باسم السائق..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
      </div>

      <div className="drivers-table">
        <div className="drivers-table-header">
          <span>الاسم</span>
          <span>الهاتف</span>
          <span>نوع السيارة</span>
          <span>عدد الخطوط</span>
          <span>إجراءات</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="empty">لا يوجد سواق</div>
        ) : (
          filteredDrivers.map((driver) => (
            <div
              key={driver.id}
              className="drivers-table-row"
              onClick={() => router.push(`/drivers/${driver.id}`)}
            >
              <span>{driver.name}</span>
              <span className="phone-number">{driver.phone_number || "-"}</span>
              <span>{driver.car_type || "-"}</span>
              <span>{linesCountByDriver[driver.id] || 0}</span>
              <span style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                <button
                  className="create-btn"
                  style={{ height: "26px", padding: "0 10px", whiteSpace: "nowrap" }}
                  disabled={deletingId === driver.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetPassword(driver);
                  }}
                >
                  كلمة مرور جديدة
                </button>
                <button
                  className="delete-btn small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDriver(driver);
                  }}
                  disabled={deletingId === driver.id}
                >
                  {deletingId === driver.id ? <ClipLoader size={12} color="#fff" /> : "حذف"}
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Drivers;
