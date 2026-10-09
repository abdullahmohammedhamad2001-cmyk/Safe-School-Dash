"use client";

import React, { useState, useMemo,useEffect } from "react";
import { rpc, enrollErrorMessage } from "../supabaseClient";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import { sortClasses } from "../lib/sortClasses";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import StudentsImport from "./StudentsImport";
import "../app/style.css";

const Students = () => {
  const { students, classes, loading, refresh } = useGlobalState();
  const router = useRouter();

  const [nameFilter, setNameFilter] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [parentFilter, setParentFilter] = useState("all");
  const [openModal, setOpenModal] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentParentName, setStudentParentName] = useState("");
  const [studentSex, setStudentSex] = useState("male");
  const [studentBirthDate, setStudentBirthDate] = useState("");
  const [studentPhoneNumber, setStudentPhoneNumber] = useState("");
  const [studentClassId, setStudentClassId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [openDeletedModal, setOpenDeletedModal] = useState(false);
  const [selectedRestoreStudent, setSelectedRestoreStudent] = useState(null);
  const [restoreAcademicYear, setRestoreAcademicYear] = useState("");
  const [restoreClassId, setRestoreClassId] = useState("");
  const [loadingRestore, setLoadingRestore] = useState(false);

  // Map class id → name
  const classMap = useMemo(() => {
    const map = {};
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  //Sort classes
  const sortedClasses = useMemo(() => {
    return sortClasses(classes);
  }, [classes]);

  //Filter students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (s.account_deleted) return false;

      if (nameFilter && !s.name?.includes(nameFilter)) return false;

      if (classFilter !== "all" && s.class_id !== classFilter) return false;

      if (parentFilter === "yes" && !s.linked_parent) return false;
      if (parentFilter === "no" && s.linked_parent) return false;

      return true;
    });
  }, [students, nameFilter, classFilter, parentFilter]);

  //Deleted students list
  const deletedStudents = useMemo(() => {
    return students.filter((s) => s.account_deleted);
  }, [students]);

  //Academic year options
  const getAcademicYearOptions = () => {
    const today = new Date();
    const year = today.getFullYear();

    return [
      `${year - 1}-${year}`,
      `${year}-${year + 1}`
    ];
  };

  useEffect(() => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    const defaultYear =
      month >= 6
        ? `${year}-${year + 1}`   // June → next year
        : `${year - 1}-${year}`;  // before → current year

    setAcademicYear(defaultYear);
  }, []);

  //Open create new student modal
  const openCreateModal = () => setOpenModal(true);

  //Close create new student modal
  const closeCreateModal = () => {
    setOpenModal(false);
    setStudentName("");
    setStudentParentName("");
    setStudentSex("male");
    setStudentBirthDate("");
    setStudentPhoneNumber("")
  };

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

  //Create new student
  const handleCreateStudent = async () => {
    try {
      setLoadingCreate(true);

      //Basic validation
      if (!studentName ||!studentParentName ||!studentPhoneNumber ||!studentBirthDate) {
        alert("يرجى إدخال جميع البيانات");
        return;
      }

      if (!academicYear) {
        alert("يرجى اختيار السنة الدراسية");
        return;
      }

      if (!studentClassId) {
        alert("يرجى تحديد الصف");
        return;
      }

      const schoolId = localStorage.getItem("adminSchoolID");
      const country = localStorage.getItem("schoolCountry") || "iraq";

      const phoneError = validatePhoneNumber(studentPhoneNumber, country);

      if (phoneError) {
        alert(phoneError);
        return;
      }

      if (!schoolId || schoolId === "ALL") {
        alert("لم يتم العثور على بيانات المدرسة");
        return;
      }

      // Student, yearly record, bills and class chats are created in one database transaction
      await rpc("create_student", {
        p_school: schoolId,
        p_name: studentName.trim(),
        p_parent_name: studentParentName.trim(),
        p_phone: formatPhoneNumber(studentPhoneNumber, country),
        p_sex: studentSex,
        p_birth: studentBirthDate,
        p_class: studentClassId,
        p_year: academicYear,
        p_country: country,
      });

      await refresh();

      alert("تم إنشاء الطالب والفواتير بنجاح");

      closeCreateModal();

    } catch (e) {
      console.error("Create student failed:", e);
      alert(enrollErrorMessage(e, academicYear) || "فشل إنشاء الطالب");
    } finally {
      setLoadingCreate(false);
    }
  };

  //Restore student
  const handleRestoreStudent = async () => {
    try {
      if (!selectedRestoreStudent || !restoreClassId || !restoreAcademicYear) {
        alert("يرجى اختيار الفصل");
        return;
      }

      setLoadingRestore(true);

      await rpc("restore_student", {
        p_student: selectedRestoreStudent.id,
        p_class: restoreClassId,
        p_year: restoreAcademicYear,
      });

      await refresh();

      alert("تم استرجاع الطالب وتنظيم بياناته بنجاح");

      setSelectedRestoreStudent(null);
      setRestoreAcademicYear("");
      setOpenDeletedModal(false);

    } catch (e) {
      console.error(e);
      alert(enrollErrorMessage(e, restoreAcademicYear) || "فشل استرجاع الطالب");
    } finally {
      setLoadingRestore(false);
    }
  };

  const closeDeletedStudentsModal = () => {
    setSelectedRestoreStudent(null);
    setOpenDeletedModal(false);
  }

  return (
    <div className="students-container">

      <div className="students-header">
        <h2>الطلاب</h2>

        <div style={{ display: "flex",flexDirection:'row-reverse', gap: 10 }}>
          <div className="create-btn" onClick={openCreateModal}>
            <p>+ إنشاء حساب طالب</p>
          </div>

          <div
            className="create-btn"
            style={{ background: "#64748b" }}
            onClick={() => setOpenDeletedModal(true)}
          >
            <p>الطلاب المنقطعين</p>
          </div>

          <div
            className="create-btn"
            style={{ background: "#15803d" }}
            onClick={() => setOpenImport(true)}
          >
            <p>استيراد من Excel</p>
          </div>
        </div>
      </div>

      <StudentsImport open={openImport} onClose={() => setOpenImport(false)} />

      <Modal
        title="إنشاء حساب طالب"
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

          <div className="input-group">
            <label>السنة الدراسية</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            >
              {getAcademicYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <select
            value={studentClassId}
            onChange={(e) => setStudentClassId(e.target.value)}
          >
            <option value="">اختر الفصل</option>

            {sortedClasses.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>

          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateStudent}>
             إنشاء
            </button>
          )}

        </div>
      </Modal>

      <Modal
        title="الطلاب المنقطعين"
        open={openDeletedModal}
        onCancel={closeDeletedStudentsModal}
        footer={null}
        centered
      >
        <div className="students-table">

          <div className="deleted-students-table-header">
            <span>الاسم</span>
            <span>الهاتف</span>
            <span>استرجاع</span>
          </div>

          {deletedStudents.length === 0 ? (
            <div className="empty">لا يوجد طلاب منقطعين</div>
          ) : (
            deletedStudents.map((student) => (
              <div
                key={student.id}
                className={`deleted-students-table-row ${
                  selectedRestoreStudent?.id === student.id ? "active" : ""
                }`}
              >
                <span>{student.name} {student.parent_name}</span>
                <span className="phone-number">{student.phone_number || "-"}</span>
                <span>
                  <button
                    className="create-submit"
                    onClick={() => {
                      setSelectedRestoreStudent(student);
                      setRestoreClassId("");
                    }}
                  >
                   استرجاع
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        {/* SELECT CLASS */}
        {selectedRestoreStudent && (
          <div className="restore-students-select-students">
            <div className="restore-students-select-students-form">
              <div className="input-group" style={{flexDirection:'row-reverse',alignItems:'center'}}>
                <label>السنة الدراسية</label>
                <select
                  value={restoreAcademicYear}
                  onChange={(e) => setRestoreAcademicYear(e.target.value)}
                >
                  {getAcademicYearOptions().map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group" style={{flexDirection:'row-reverse',alignItems:'center'}}>
                <label>الفصل الدراسي</label>
                <select
                  value={restoreClassId}
                  onChange={(e) => setRestoreClassId(e.target.value)}
                >
                  <option value="">اختر الفصل</option>
                  {sortedClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.grade} {cls.specialization ? cls.specialization : ''} ({cls.section})
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                className="create-submit"
                onClick={handleRestoreStudent}
              >
                {loadingRestore ? (
                  <ClipLoader size={15} color="#fff" />
                ) : (
                  "تأكيد الاسترجاع"
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    
      {/* Filters */}
      <div className="students-filters">
        <input
          placeholder="البحث بالاسم..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />

        {/* ✅ Class Filter */}
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="all">كل الفصول</option>
          {sortedClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Parent Filter */}
        <select
          value={parentFilter}
          onChange={(e) => setParentFilter(e.target.value)}
        >
          <option value="all">ولي الأمر</option>
          <option value="yes">نعم</option>
          <option value="no">لا</option>
        </select>
      </div>

      {/* Table */}
      <div className="students-table">
        <div className="table-header">
          <span>الاسم</span>
          <span>الفصل</span>
          <span>الهاتف</span>
          <span>ولي الأمر</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty">لا يوجد طلاب</div>
        ) : (
          filteredStudents.map((student) => (
            <div 
              key={student.id} 
              className="table-row"
              style={{cursor:'pointer'}}
              onClick={() => router.push(`/students/${student.id}`)}
            >
              <span>
                {student.name} {student.parent_name}
              </span>

              {/* ✅ Class name instead of school */}
              <span>{classMap[student.class_id] || "-"}</span>

              <span className="phone-number">
                {student.phone_number || "-"}
              </span>

              <span
                className={
                  student.linked_parent ? "status yes" : "status no"
                }
              >
                {student.linked_parent ? "نعم" : "لا"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Students;