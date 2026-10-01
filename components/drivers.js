"use client";

import React, { useState, useMemo } from "react";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { DB } from "../firebaseConfig";
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

const generatePassword = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
};

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

    const normalizedPhone = normalizePhone(driverPhoneNumber);
    if (!normalizedPhone) {
      alert("رقم الهاتف غير صالح (يجب أن يبدأ بـ 7 ويكون 10 أرقام)");
      return;
    }

    try {
      setLoadingCreate(true);

      // Phone number is the driver document id, so it must be unique
      const driverRef = doc(DB, "drivers", normalizedPhone);
      const existingDoc = await getDoc(driverRef);

      if (existingDoc.exists()) {
        alert("رقم الهاتف مستخدم بالفعل");
        return;
      }

      const password = generatePassword();
      const storage = getStorage();

      const personalRef = ref(storage, `drivers/personal_${Date.now()}_${driverPersonalImageFile.name}`);
      await uploadBytes(personalRef, driverPersonalImageFile);
      const personalURL = await getDownloadURL(personalRef);

      const carRef = ref(storage, `drivers/car_${Date.now()}_${driverCarImageFile.name}`);
      await uploadBytes(carRef, driverCarImageFile);
      const carURL = await getDownloadURL(carRef);

      await setDoc(driverRef, {
        name: driverName.trim(),
        phone_number: normalizedPhone,
        username: normalizedPhone,
        password,
        personal_image: personalURL,
        car_type: driverCarType,
        car_plate: driverCarPlate.trim(),
        car_seats: Number(driverCarSeats),
        car_image: carURL,
        lines: [],
        location: { latitude: 33.3152, longitude: 44.3661 },
        school_id: schoolId,
        is_active: true,
        created_at: new Date(),
      });

      setNewDriverCredentials({ username: normalizedPhone, password });
      closeCreateModal();
      refresh();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء إنشاء السائق");
    } finally {
      setLoadingCreate(false);
    }
  };

  const handleDeleteDriver = async (driver) => {
    if (!confirm(`هل تريد حذف السائق "${driver.name}" نهائياً؟ سيتم حذف جميع بياناته وإخراجه من التطبيق`)) return;

    try {
      setDeletingId(driver.id);

      // Release the driver's lines and their riders
      const linesSnap = await getDocs(query(collection(DB, "lines"), where("driver_id", "==", driver.id)));
      for (const lineDoc of linesSnap.docs) {
        const riders = lineDoc.data().riders || [];
        await updateDoc(doc(DB, "lines", lineDoc.id), {
          driver_id: null,
          driver_name: null,
          car_type: null,
        });
        await Promise.all(
          riders.map((studentId) => updateDoc(doc(DB, "students", studentId), { driver_id: null }))
        );
      }

      const storage = getStorage();
      await Promise.all(
        [driver.personal_image, driver.car_image].map(async (url) => {
          if (!url) return;
          try {
            await deleteObject(ref(storage, url));
          } catch (e) {
            console.warn("Could not delete image:", e);
          }
        })
      );

      await deleteDoc(doc(DB, "drivers", driver.id));

      refresh();
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
          <span>حذف</span>
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
              <span>
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
