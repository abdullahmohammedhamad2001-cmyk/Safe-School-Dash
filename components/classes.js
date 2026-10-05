"use client";

import React, { useMemo, useState } from "react";
import { supabase, rpc } from "../supabaseClient";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { FaRegTrashCan } from "react-icons/fa6";
import { sortClasses, EDUCATION_ORDER, GRADE_ORDER } from "../lib/sortClasses";
import { Modal } from "antd";
import "../app/style.css";

const Classes = () => {
  const { classes, students, loading, refresh } = useGlobalState();
  const router = useRouter();

  const [levelFilter, setLevelFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [openModal, setOpenModal] = useState(false);
  const [classLevel, setClassLevel] = useState("");
  const [classGrade, setClassGrade] = useState("");
  const [classSection, setClassSection] = useState("");
  const [classSpecialization, setClassSpecialization] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState(null);
  const sortedClasses = useMemo(() => {
    return sortClasses(classes);
  }, [classes]);

  // Education levels
  const educationLevels = useMemo(() => {
    const uniqueLevels = [...new Set(classes.map((c) => c.educationLevel))];

    return uniqueLevels.sort((a, b) => {
      return (EDUCATION_ORDER[a] ?? 999) - (EDUCATION_ORDER[b] ?? 999);
    });
  }, [classes]);

  // Grades levels
  const grades = useMemo(() => {
    if (levelFilter === "all") return [];

    const uniqueGrades = [
      ...new Set(
        classes
          .filter((c) => c.educationLevel === levelFilter)
          .map((c) => c.grade)
      ),
    ];

    return uniqueGrades.sort((a, b) => {
      return (
        (GRADE_ORDER[levelFilter]?.[a] ?? 999) -
        (GRADE_ORDER[levelFilter]?.[b] ?? 999)
      );
    });
  }, [classes, levelFilter]);

  // ✅ Count students per class
  const studentCountMap = useMemo(() => {
    const map = {};

    students.forEach((s) => {
      if (s.account_deleted) return;
      if (s.graduated) return;
      if (!s.class_id) return;

      if (!map[s.class_id]) map[s.class_id] = 0;
      map[s.class_id]++;
    });

    return map;
  }, [students]);

  // ✅ Filter classes
  const filteredClasses = useMemo(() => {
    return sortedClasses.filter((c) => {
      if (levelFilter !== "all" && c.educationLevel !== levelFilter)
        return false;

      if (gradeFilter !== "all" && c.grade !== gradeFilter)
        return false;

      return true;
    });
  }, [sortedClasses, levelFilter, gradeFilter]);

  //Open create new class modal
  const openCreateModal = () => setOpenModal(true);

  //Close create new class modal
  const closeCreateModal = () => {
    setOpenModal(false);
    setClassLevel("");
    setClassGrade("");
    setClassSection("");
    setClassSpecialization("")
  };

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

  const SPECIALIZATIONS = [
    "علمي",
    "أدبي",
    "تجاري",
    "اسلامي",
    "مهني",
    "فنون جميلة",
    "تمريض",
  ];

  const daysOfWeek = [
    { key: "sunday", label: "الأحد", index: 0 },
    { key: "monday", label: "الاثنين", index: 1 },
    { key: "tuesday", label: "الثلاثاء", index: 2 },
    { key: "wednesday", label: "الأربعاء", index: 3 },
    { key: "thursday", label: "الخميس", index: 4 },
    { key: "friday", label: "الجمعة", index: 5 },
    { key: "saturday", label: "السبت", index: 6 },
  ];

  const buildDefaultTimetable = () => {
    return daysOfWeek.map((day) => ({
      active: false,
      day: day.label,
      dayIndex: day.index,
      sessions: [],
    }));
  };

  const handleCreateClass = async () => {
    try {
      setLoadingCreate(true);

      if (!classLevel || !classGrade || !classSection) {
        alert("يرجى إدخال جميع البيانات");
        return;
      }

      const schoolId = localStorage.getItem("adminSchoolID");
      if (!schoolId || schoolId === "ALL") {
        alert("لم يتم العثور على المدرسة");
        return;
      }

      const needsSpecialization = classLevel === "إعدادي";
      const section = classSection.trim();

      //Build class name
      const className = needsSpecialization
        ? `${classGrade} ${classSpecialization} - ${classSection}`
        : `${classGrade} - ${classSection}`;

      const exists = classes.some(
        (c) =>
          c.schoolId === schoolId &&
          c.educationLevel === classLevel &&
          c.grade === classGrade &&
          c.section === section &&
          (needsSpecialization ? c.specialization === classSpecialization : !c.specialization)
      );

      if (exists) {
        alert("هذا الصف موجود مسبقًا");
        return;
      }

      const { error } = await supabase.from("classes").insert({
        school_id: schoolId,
        education_level: classLevel,
        grade: classGrade,
        section,
        specialization: needsSpecialization ? classSpecialization : null,
        name: className,
        timetable: buildDefaultTimetable(),
      });

      if (error) {
        if (error.code === "23505") {
          alert("هذا الصف موجود مسبقًا");
          return;
        }
        throw error;
      }

      await refresh();

      alert("تم إنشاء الصف بنجاح");

      closeCreateModal();

    } catch (e) {
      console.error(e);
      alert("فشل إنشاء الصف");
    } finally {
      setLoadingCreate(false);
    }
  };

  const handleDeleteClass = async (cls) => {
    if ((studentCountMap[cls.id] || 0) > 0) {
      alert("لا يمكن حذف صف يحتوي على طلاب. انقل الطلاب إلى صف آخر أولاً.");
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف الصف "${cls.name}"؟ سيتم حذف جدوله ومحادثاته.`)) return;

    try {
      setDeletingClassId(cls.id);

      await rpc("delete_class", { p_class: cls.id });

      await refresh();
    } catch (e) {
      console.error(e);
      alert(
        e.message?.includes("CLASS_HAS_STUDENTS")
          ? "لا يمكن حذف صف يحتوي على طلاب. انقل الطلاب إلى صف آخر أولاً."
          : "فشل حذف الصف"
      );
    } finally {
      setDeletingClassId(null);
    }
  };

  return (
    <div className="students-container">
      <div className="students-header">
        <h2>الصفوف</h2>
        <div className="create-btn" onClick={openCreateModal}>
          <p>+ إنشاء صف</p>
        </div>
      </div>

      <Modal
        title="إنشاء صف"
        open={openModal}
        onCancel={closeCreateModal}
        footer={null}
        centered
      >
        <div className="create-school-form">

          {/* Level */}
          <select
            value={classLevel}
            onChange={(e) => {
              setClassLevel(e.target.value);
              setClassGrade("");
            }}
          >
            <option value="">اختر المرحلة</option>
            {EDUCATION_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>

          {/* Grade */}
          <select
            value={classGrade}
            onChange={(e) => setClassGrade(e.target.value)}
            disabled={!classLevel}
          >
            <option value="">اختر الصف</option>
            {(GRADES_BY_LEVEL[classLevel] || []).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* Specialization (only إعدادي) */}
          {classLevel === "إعدادي" && (
            <select
              value={classSpecialization}
              onChange={(e) => setClassSpecialization(e.target.value)}
            >
              <option value="">اختر الفرع</option>
              {SPECIALIZATIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Section */}
          <input
            placeholder="الشعبة (أ / ب / 1 ...)"
            value={classSection}
            onChange={(e) => setClassSection(e.target.value)}
          />

          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateClass}>
             إنشاء
            </button>
          )}

        </div>
      </Modal>

      {/* Filters */}
      <div className="students-filters">
        <select
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setGradeFilter("all"); // reset grade
          }}
        >
          <option value="all">كل المراحل</option>
          {educationLevels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>

        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          disabled={levelFilter === "all"}
        >
          <option value="all">كل الصفوف</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="students-table">
        <div className="classes-table-header">
          <span>المرحلة</span>
          <span>الصف</span>
          <span>الشعبة</span>
          <span>عدد الطلاب</span>
          <span>حذف</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="empty">لا يوجد فصول</div>
        ) : (
          filteredClasses.map((cls) => (
            <div 
              key={cls.id} 
              className="classes-table-row"
              style={{cursor:'pointer'}}
              onClick={() => router.push(`/classes/${cls.id}`)}
            >
              <span>{cls.educationLevel}</span>
              <span>{cls.grade} {cls.specialization ? cls.specialization : ''}</span>
              <span>{cls.section}</span>
              <span>
                <div className="student-count-badge">
                  {studentCountMap[cls.id] || 0}
                </div>
              </span>
              <span>
                <button
                  className="class-delete-btn"
                  title="حذف الصف"
                  disabled={deletingClassId === cls.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClass(cls);
                  }}
                >
                  {deletingClassId === cls.id ? <ClipLoader size={14} color="#ef4444" /> : <FaRegTrashCan size={15} />}
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Classes;