"use client";

import React, { useState,useMemo } from "react";
import {collection,addDoc,setDoc,doc,runTransaction,Timestamp,getDoc} from "firebase/firestore";
import { DB } from "../firebaseConfig";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import "../app/style.css";

const Teachers = () => {
  const { teachers, classes, loading } = useGlobalState();
  
  const country = localStorage.getItem("schoolCountry") || "iraq";

  const [nameFilter, setNameFilter] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [teacherPhoneNumber, setTeacherPhoneNumber] = useState("");
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [openDeletedTeachersModal, setOpenDeletedTeachersModal] = useState(false);
  const [selectedRestoreTeacher, setSelectedRestoreTeacher] = useState(null);
  const [loadingRestoreTeacher, setLoadingRestoreTeacher] = useState(false);

  // Map class id → display name
  const classMap = {};
  classes.forEach((c) => {
    classMap[c.id] = `${c.grade} - ${c.section}`;
  });

  //Filter teachers
  const filteredTeachers = useMemo(() => {
    return teachers.filter((s) => {
      if (s.account_deleted) return false;
      if (nameFilter && !s.name?.includes(nameFilter)) return false;  
      return true;
    });
  }, [teachers, nameFilter]);

  //Deleted teachers list
  const deletedTeachers = useMemo(() => {
    return teachers.filter((t) => t.account_deleted);
  }, [teachers]);

  //Open create new teacher modal
  const openCreateModal = () => setOpenModal(true);

  //Close create new teacher modal
  const closeCreateModal = () => {
    setOpenModal(false);
    setTeacherName("");
    setTeacherPhoneNumber("");
    setTeacherSubjects([])
  };

  //Subjects
  const SUBJECTS =
    country === "tunisia"
    ? [
        "اللغة العربية",
        "اللغة الفرنسية",
        "اللغة الإنقليزية",
        "الرياضيات",
        "الإيقاظ العلمي",
        "علوم فيزيائية",
        "علوم الحياة والأرض",
        "تاريخ و جغرافيا",
        "التربية الإسلامية",
        "التربية المدنية",
        "الإعلامية",
        "التربية التقنية",
        "التربية التشكيلية",
        "التربية الموسيقية",
        "التربية البدنية",
        "اللغة الألمانية",
        "اللغة الإيطالية",
        "اللغة الإسبانية",
      ]
    : [
        "اللغة العربية",
        "اللغة الإنجليزية",
        "اللغة الفرنسية",
        "الرياضيات",
        "العلوم",
        "الفيزياء",
        "الكيمياء",
        "الأحياء",
        "التاريخ",
        "الجغرافيا",
        "التربية الإسلامية",
        "التربية الوطنية",
        "التربية الفنية",
        "التربية الرياضية",
        "الحاسوب",
        "الاقتصاد",
        "علم الاجتماع",
        "الفلسفة",
        "المنطق",
        
      ];

  //Validate phone number
  const validatePhoneNumber = (phone, country) => {
    if (!phone) return "الرجاء إدخال رقم الهاتف";

    if (country === "iraq") {
      if (phone.length !== 10) return "رقم الهاتف يجب أن يتكون من 10 أرقام";
      if (!phone.startsWith("7")) return "رقم الهاتف يجب أن يبدأ بالرقم 7";
    }

    if (country === "tunisia") {
      if (phone.length !== 8) return "رقم الهاتف يجب أن يتكون من 8 أرقام";
      if (!["2","5","9"].includes(phone[0])) return "رقم الهاتف غير صحيح";
    }

    return null;
  };
  
  //Create new teacher doc
  const handleCreateTeacher = async () => {
    try {
      setLoadingCreate(true);

      //Validation
      if (!teacherName || !teacherPhoneNumber || teacherSubjects.length === 0) {
        alert("يرجى إدخال جميع البيانات");
        return;
      }

      const phoneError = validatePhoneNumber(teacherPhoneNumber, country);
      if (phoneError) {
        alert(phoneError);
        return;
      }

      //Prevent duplicate
      const existingSnap = await getDoc(
        doc(DB, "schoolAdmins", teacherPhoneNumber.trim())
      );
      
      if (existingSnap.exists()) {
        alert("رقم الهاتف مستخدم بالفعل");
        return;
      }

      const schoolId = localStorage.getItem("adminSchoolID");
      const schoolName = localStorage.getItem("adminSchoolName");
      const logo = localStorage.getItem("schoolLogo");

      if (!schoolId || !schoolName) {
        alert("لم يتم العثور على بيانات المدرسة");
        return;
      }

      // 🔥 Generate password
      const tempPassword = Math.random().toString(36).slice(-8);

      // 🔥 Build subjects map
      const subjectsMap = {};

      teacherSubjects.forEach((subjectName) => {
        const subjectId = subjectName.replace(/\s+/g, "_").toLowerCase();

        subjectsMap[subjectId] = {
          name: subjectName,
          class_ids: [],
        };
      });

      //Create teacher doc
      const teacherRef = await addDoc(collection(DB, "teachers"), {
        name: teacherName.trim(),
        phone_number: teacherPhoneNumber.trim(),
        subjects: subjectsMap,
        school_id: schoolId,
        country: country,
        is_active: true,
        account_deleted: false,
        created_at: Timestamp.now(),
        username: teacherPhoneNumber.trim(),
        password: tempPassword,
      });

      const teacherId = teacherRef.id;

      //Create school admin (teacher login)
      await setDoc(doc(DB, "schoolAdmins", teacherPhoneNumber.trim()), {
        username: teacherPhoneNumber.trim(),
        password: tempPassword,
        role: "teacher",
        name: teacherName.trim(),
        school: schoolName,
        school_id: schoolId,
        school_logo: logo,
        teacher_id: teacherId,
        country: country,
        account_banned: false,
      });

      alert("تم إنشاء حساب المدرس بنجاح");

      closeCreateModal();

    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء إنشاء المدرس");
    } finally {
      setLoadingCreate(false);
    }
  };

  //Restore teacher
  const handleRestoreTeacher = async () => {
    try {
      if (!selectedRestoreTeacher) {
        alert("يرجى اختيار المدرس");
        return;
      }

      setLoadingRestoreTeacher(true);

      const teacherRef = doc(DB, "teachers", selectedRestoreTeacher.id);
      const schoolAdminRef = doc(DB, "schoolAdmins", selectedRestoreTeacher.username);

      await runTransaction(DB, async (transaction) => {

        // ✅ Restore teacher
        transaction.update(teacherRef, {
          account_deleted: false,
          is_active: true,
          deleted_at: null,
        });

        // ✅ Unban login
        transaction.update(schoolAdminRef, {
          account_banned: false,
          banned_at: null,
        });

      });

      alert("تم استرجاع حساب المدرس بنجاح");

      setSelectedRestoreTeacher(null);
      setOpenDeletedTeachersModal(false);

    } catch (e) {
      console.error(e);
      alert("فشل استرجاع الحساب");
    } finally {
      setLoadingRestoreTeacher(false);
    }
  };

  return (
    <div className="students-container">
      <div className="students-header">
        <h2>المدرسين</h2>
        <div style={{ display: "flex",flexDirection:'row-reverse', gap: 10 }}>
          <div className="create-btn" onClick={openCreateModal}>
            <p>+ إنشاء حساب مدرس</p>
          </div>
          <div
            className="create-btn"
            style={{ background: "#64748b" }}
            onClick={() => setOpenDeletedTeachersModal(true)}
          >
            <p>المدرسين المحذوفين</p>
          </div>
        </div>
      </div>

      <Modal
        title="إنشاء حساب مدرس"
        open={openModal}
        onCancel={closeCreateModal}
        footer={null}
        centered
      >
        <div className="create-school-form">
          <input
            placeholder="الاسم الكامل"
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
          />

          <input
            placeholder="رقم الهاتف"
            value={teacherPhoneNumber}
            onChange={(e) => setTeacherPhoneNumber(e.target.value)}
          />

          <select
            onChange={(e) => {
              const value = e.target.value;

              if (value && !teacherSubjects.includes(value)) {
                setTeacherSubjects([...teacherSubjects, value]);
              }
            }}
          >
            <option value="">اختر المادة</option>
            {SUBJECTS.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>

          {/* 🔥 Selected subjects */}
          <div className="selected-subjects">
            {teacherSubjects.map((subj) => (
              <div key={subj} className="chip subject-chip">
                {subj}
                {teacherSubjects.length > 1 && (
                  <span
                    className="remove-chip"
                    onClick={() =>
                      setTeacherSubjects(teacherSubjects.filter(s => s !== subj))
                    }
                  >
                    ×
                  </span>
                )}
              </div>
            ))}
          </div>  
      
          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateTeacher}>
             إنشاء
            </button>
          )}
      
        </div>
      </Modal>

      <Modal
        title="المدرسين المحذوفين"
        open={openDeletedTeachersModal}
        onCancel={() => {
          setOpenDeletedTeachersModal(false);
          setSelectedRestoreTeacher(null);
        }}
        footer={null}
        centered
      >
        <div className="students-table">
          <div className="deleted-students-table-header">
            <span>الاسم</span>
            <span>اسم المستخدم</span>
            <span>استرجاع</span>
          </div>

          {deletedTeachers.length === 0 ? (
            <div className="empty">لا يوجد مدرسين محذوفين</div>
          ) : (
            deletedTeachers.map((teacher) => (
              <div
                key={teacher.id}
                className={`deleted-students-table-row ${
                  selectedRestoreTeacher?.id === teacher.id ? "active" : ""
                }`}
              >
                <span>{teacher.name}</span>
                <span>{teacher.username}</span>
                <span>
                  <button
                    className="create-submit"
                    onClick={() => {
                      setSelectedRestoreTeacher(teacher);
                    }}
                  >
                   استرجاع
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        {/* RESTORE ACTION */}
        {selectedRestoreTeacher && (
          <div className="restore-students-select-students">
            <button
              className="create-submit"
              style={{marginTop:'10px'}}
              onClick={handleRestoreTeacher}
            >
              {loadingRestoreTeacher ? (
                <ClipLoader size={15} color="#fff" />
              ) : (
                "تأكيد الاسترجاع"
              )}
            </button>
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
      </div>

      {/* Table */}
      <div className="students-table">
        <div className="teacher-table-header">
          <span>الاسم</span>
          <span>الهاتف</span>
          <span>المواد</span>
          <span>الفصول</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="empty">لا يوجد مدرسين</div>
        ) : (
          filteredTeachers.map((teacher) => (
            <TeacherRow
              key={teacher.id}
              teacher={teacher}
              classMap={classMap}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Teachers;


// 🔥 Row Component (clean + scalable)
const TeacherRow = ({ teacher, classMap }) => {
  const router = useRouter();
  const subjects = teacher.subjects || {};
  const subjectKeys = Object.keys(subjects);

  const [selectedSubject, setSelectedSubject] = useState(
    subjectKeys[0] || null
  );

  return (
    <div 
      className="teacher-table-row"
      style={{cursor:'pointer'}}
      onClick={() => router.push(`/teachers/${teacher.id}`)}
    >

      {/* Name */}
      <span>{teacher.name}</span>

      {/* Phone */}
      <span className="phone-number">
        {teacher.phone_number || "-"}
      </span>

      {/* Subjects */}
      <span className="chips-cell">
        {subjectKeys.map((key) => {
          const subject = subjects[key];
          const isActive = selectedSubject === key;

          return (
            <div
              key={key}
              className={`chip subject-chip ${isActive ? "active" : ""}`}
              onClick={() => setSelectedSubject(key)}
            >
              {subject.name}
            </div>
          );
        })}
      </span>

      {/* Classes */}
      <span className="chips-cell">
        {selectedSubject &&
          subjects[selectedSubject]?.class_ids?.map((classId) => (
            <div key={classId} className="chip class-chip">
              {classMap[classId] || "-"}
            </div>
          ))}
      </span>

    </div>
  );
};