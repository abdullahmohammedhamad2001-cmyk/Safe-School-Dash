"use client";

import React, { useState, useMemo } from "react";
import {collection,addDoc,serverTimestamp,Timestamp} from "firebase/firestore";
import { DB } from "../firebaseConfig";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import "../app/style.css";

const EDUCATION_LEVELS = ["ابتدائي", "متوسط", "إعدادي"];

const GRADES_BY_LEVEL = {
  ابتدائي: [
    "أول ابتدائي",
    "ثاني ابتدائي",
    "ثالث ابتدائي",
    "رابع ابتدائي",
    "خامس ابتدائي",
    "سادس ابتدائي",
  ],
  متوسط: [
    "أول متوسط",
    "ثاني متوسط",
    "ثالث متوسط",
  ],
  إعدادي: [
    "رابع إعدادي",
    "خامس إعدادي",
    "سادس إعدادي",
  ],
};

const StudentsRequests = () => {
  const { studentsRequests,loading } = useGlobalState();
  const router = useRouter();

  const [nameFilter, setNameFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [openModal, setOpenModal] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentParentName, setStudentParentName] = useState("");
  const [studentSex, setStudentSex] = useState("male");
  const [studentBirthDate, setStudentBirthDate] = useState("");
  const [studentPhoneNumber, setStudentPhoneNumber] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);

  //Filter requests
  const filteredStudentsRequests = useMemo(() => {
    return studentsRequests.filter((s) => {
      // 🔍 name filter
      if (nameFilter && !s.name?.includes(nameFilter)) return false;

      // 🎓 level filter
      if (levelFilter !== "all" && s.requested_level !== levelFilter) {
        return false;
      }

      // 🎓 grade filter
      if (gradeFilter !== "all" && s.requested_grade !== gradeFilter) {
        return false;
      }

      return true;
    });
  }, [studentsRequests, nameFilter, levelFilter, gradeFilter]);

  //Open create new student modal
  const openCreateModal = () => setOpenModal(true);

  //Validate phone
  const validatePhoneNumber = (phone, country) => {
    if (!phone) return "الرجاء إدخال رقم الهاتف";

    if (country === "iraq") {
      if (phone.length !== 10) return "رقم الهاتف يجب أن يتكون من 10 أرقام";
      if (!phone.startsWith("7")) return "رقم الهاتف يجب أن يبدأ بالرقم 7";
    }

    if (country === "tunisia") {
      if (phone.length !== 8) return "رقم الهاتف يجب أن يتكون من 8 أرقام";
      if (!["2", "5", "9"].includes(phone[0])) return "رقم الهاتف غير صحيح";
    }

    return null;
  };

  //Format phone
  const formatPhoneNumber = (phone, country) => {
    if (country === "iraq") return `+964${phone}`;
    if (country === "tunisia") return `+216${phone}`;
    return phone;
  };

  //Create new request
  const handleCreateRequest = async () => {
    try {
      setLoadingCreate(true);

      if (!studentName || !studentParentName || !studentPhoneNumber || !studentBirthDate) {
        alert("يرجى إدخال جميع البيانات");
        return;
      }

      if (!selectedLevel || !selectedGrade) {
        alert("يرجى اختيار المرحلة والصف");
        return;
      }

      const schoolId = localStorage.getItem("adminSchoolID");
      const country = localStorage.getItem("schoolCountry") || "iraq";

      const phoneError = validatePhoneNumber(studentPhoneNumber, country);
      if (phoneError) {
        alert(phoneError);
        return;
      }

      if (!schoolId) {
        alert("لم يتم العثور على بيانات المدرسة");
        return;
      }

      const birthDate = Timestamp.fromDate(new Date(studentBirthDate));

      await addDoc(collection(DB, "students_requests"), {
        name: studentName.trim(),
        parent_name: studentParentName.trim(),
        phone_number: formatPhoneNumber(studentPhoneNumber,country),
        sex: studentSex,
        birth_date: birthDate,
        school_id: schoolId,
        requested_level: selectedLevel,
        requested_grade: selectedGrade,
        status: "pending",
        request_date: serverTimestamp(),
      });

      alert("تم تسجيل الطلب");
      closeCreateModal();

    } catch (e) {
      console.error(e);
      alert("فشل تسجيل الطلب");
    } finally {
      setLoadingCreate(false);
    }
  };

  //Close create new student modal
  const closeCreateModal = () => {
    setOpenModal(false);
    setStudentName("");
    setStudentParentName("");
    setStudentSex("male");
    setStudentBirthDate("");
    setStudentPhoneNumber("");
    setSelectedLevel("");
    setSelectedGrade("");
  };

  return (
    <div className="students-container">

      <div className="students-header">
        <h2>طلبات التسجيل</h2>

        <div style={{ display: "flex",flexDirection:'row-reverse', gap: 10 }}>
          <div className="create-btn" onClick={openCreateModal}>
            <p>+ إنشاء طلب تسجيل</p>
          </div>
        </div>
      </div>

      <Modal
        title="إنشاء طلب تسجيل"
        open={openModal}
        onCancel={closeCreateModal}
        footer={null}
        centered
      >
        <div className="create-school-form">

          <input
            placeholder="اسم الطالب"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />

          <input
            placeholder="اسم ولي الامر الثلاثي"
            value={studentParentName}
            onChange={(e) => setStudentParentName(e.target.value)}
          />

          <select
            value={studentSex}
            onChange={(e) => setStudentSex(e.target.value)}
          >
            <option value="male">ذكر</option>
            <option value="female">انثى</option>
          </select>

          <div className="input-group">
            <label>تاريخ الميلاد</label>
            <input
              type="date"
              value={studentBirthDate}
              onChange={(e) => setStudentBirthDate(e.target.value)}
            />
          </div>

          <input
            placeholder="رقم هاتف ولي الامر"
            value={studentPhoneNumber}
            onChange={(e) => setStudentPhoneNumber(e.target.value)}
          />

          {/* LEVEL */}
          <select
            value={selectedLevel}
            onChange={(e) => {
              setSelectedLevel(e.target.value);
              setSelectedGrade(""); // reset grade
            }}
          >
            <option value="">اختر المرحلة</option>
            {EDUCATION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          {/* GRADE */}
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            disabled={!selectedLevel}
          >
            <option value="">اختر الصف</option>

            {(GRADES_BY_LEVEL[selectedLevel] || []).map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>

          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateRequest}>
             إنشاء
            </button>
          )}

        </div>
      </Modal>
    
      {/* Filters */}
      <div className="students-filters">
        <input
          placeholder="البحث بالاسم..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />

        {/* LEVEL FILTER */}
        <select
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setGradeFilter("all"); // reset grade when level changes
          }}
        >
          <option value="all">كل المراحل</option>
          {EDUCATION_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>

        {/* GRADE FILTER */}
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          disabled={levelFilter === "all"}
        >
          <option value="all">كل الصفوف</option>

          {(levelFilter !== "all"
            ? GRADES_BY_LEVEL[levelFilter]
            : Object.values(GRADES_BY_LEVEL).flat()
          ).map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="students-table">
        <div 
          className="table-header"
          style={{gridTemplateColumns:'2fr 2.5fr 2fr 1.5fr',cursor:'pointer'}}
        >
          <span>الاسم</span>
          <span>المرحلة</span>
          <span>الهاتف</span>
          <span>تاريخ التسجيل</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : filteredStudentsRequests.length === 0 ? (
          <div className="empty">لا يوجد طلبات تسجيل</div>
        ) : (
          filteredStudentsRequests.map((student) => (
            <div 
              key={student.id} 
              className="table-row"
              style={{gridTemplateColumns:'2fr 2.5fr 2fr 1.5fr',cursor:'pointer'}}
              onClick={() => router.push(`/studentsRequests/${student.id}`)}
            >
              <span>{student.name} {student.parent_name}</span>

              <span>{student.requested_grade}</span>

              <span className="phone-number">{student.phone_number || "-"}</span>

              <span>
                {student.request_date
                  ? new Date(student.request_date.seconds * 1000)
                    .toLocaleDateString("ar-EG")
                  : "-"
                }
              </span>
              
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentsRequests;