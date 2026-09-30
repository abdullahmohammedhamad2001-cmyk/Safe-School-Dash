"use client";

import React, { useState, useMemo,useEffect } from "react";
import {collection,getDocs,query,where,doc,runTransaction,serverTimestamp,Timestamp,arrayUnion} from "firebase/firestore";
import { DB } from "../firebaseConfig";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import { sortClasses } from "../lib/sortClasses";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import "../app/style.css";

const Students = () => {
  const { students, classes, loading } = useGlobalState();
  const router = useRouter();

  const [nameFilter, setNameFilter] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [parentFilter, setParentFilter] = useState("all");
  const [openModal, setOpenModal] = useState(false);
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
      const schoolName = localStorage.getItem("adminSchoolName");
      const logo = localStorage.getItem("schoolLogo");
      const country = localStorage.getItem("schoolCountry") || "iraq";

      const phoneError = validatePhoneNumber(studentPhoneNumber, country);

      if (phoneError) {
        alert(phoneError);
        return;
      }

      if (!schoolId || !schoolName) {
        alert("لم يتم العثور على بيانات المدرسة");
        return;
      }

      // 🔹 Get selected class
      const selectedClass = classes.find(c => c.id === studentClassId);

      // 🔹 Fetch billing template
      const templatesSnap = await getDocs(
        query(
          collection(DB, "billing_templates"),
          where("school_id", "==", schoolId),
          where("academic_year", "==", academicYear)
        )
      );

      if (templatesSnap.empty) {
        alert(`لا يوجد قالب فواتير للسنة ${academicYear} \n يرجى إنشاء القالب أولاً`);
        return;
      }

      const templateDoc = templatesSnap.docs[0];
      const template = templateDoc.data();
      const noBilling = template.is_empty || !template.installments?.length;

      // 🔹 Fetch conversations BEFORE transaction
      const conversationsSnap = await getDocs(
        query(
          collection(DB, "conversations"),
          where("school_id", "==", schoolId),
          where("class_id", "==", studentClassId),
          where("scope", "==", "class_subject")
        )
      );

      const conversationIds = conversationsSnap.docs.map(d => d.id);

      // 🔥 TRANSACTION
      await runTransaction(DB, async (transaction) => {
        const schoolRef = doc(DB, "schools", schoolId);
        const schoolSnap = await transaction.get(schoolRef);

        if (!schoolSnap.exists()) {
          throw new Error("SCHOOL_NOT_FOUND");
        }

        const schoolData = schoolSnap.data();

        // 🔹 Convert birth date
        const birthDate = Timestamp.fromDate(new Date(studentBirthDate));

        const studentRef = doc(collection(DB, "students"));
        const studentId = studentRef.id;

        // ✅ Student document
        transaction.set(studentRef, {
          name: studentName.trim(),
          parent_name: studentParentName.trim(),
          phone_number: formatPhoneNumber(studentPhoneNumber,country),
          sex: studentSex,
          birth_date: birthDate,
          destination: schoolName,
          destination_location: {
            latitude: Number(schoolData.location.latitude),
            longitude: Number(schoolData.location.longitude),
          },
          school_id: schoolId,
          school_logo: logo,
          class_id: studentClassId,
          class_name: selectedClass.name,
          class_grade: selectedClass.grade,
          billing_template_id: templateDoc.id,
          home_location: null,
          home_address: null,
          linked_parent: null,
          linked_at: null,
          driver_id: null,
          line_id: null,
          account_deleted: false,
          graduated:false,
          country: country,
          notification_token: null,
          created_at: serverTimestamp(),
        });

        // 🔹 Academic year result
        const recordRef = doc(collection(DB, "academic_records"));

        transaction.set(recordRef, {
          student_id: studentId,
          school_id: schoolId,
          academic_year: academicYear,
          class_id: studentClassId,
          class_name: selectedClass.name,
          t1: null,
          t2: null,
          t3: null,
          final_average: null,
          result: null,
          created_at: Timestamp.now(),
        });

        // 🔹 Billing logic
        const gradeName = selectedClass.grade;
        const gradeTotal = template.grade_amounts?.[gradeName];

        if (!noBilling && !gradeTotal) {
          throw new Error("GRADE_AMOUNT_NOT_FOUND");
        }

        const numberOfPayments = template.number_of_payments;
        const totalAmount = Number(gradeTotal);
        const baseAmount = Math.floor(totalAmount / numberOfPayments);
        const remainder = totalAmount % numberOfPayments;

        if (!noBilling) template.installments.forEach((inst, index) => {
          const billRef = doc(collection(DB, "student_bills"));

          const adjustedAmount = index === 0 ? baseAmount + remainder : baseAmount;

          transaction.set(billRef, {
            student_id: studentId,
            school_id: schoolId,
            academic_year: academicYear,
            class_id: studentClassId,
            grade_name: gradeName,
            template_id: templateDoc.id,
            installment_index: inst.index,
            due_date: inst.due_date,
            annual_total: totalAmount,
            amount: adjustedAmount,
            status: "unpaid",
            paid_amount: 0,
            paid_at: null,
            created_at: Timestamp.now(),
          });
        });

        // 🔹 Add to conversations
        conversationIds.forEach((convId) => {
          transaction.update(doc(DB, "conversations", convId), {
            participant_ids: arrayUnion(studentId),
          });
        });
      });

      alert("تم إنشاء الطالب والفواتير بنجاح");

      closeCreateModal();

    } catch (e) {
      console.error("Create student failed:", e);
      alert("فشل إنشاء الطالب");
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

      const schoolId = localStorage.getItem("adminSchoolID");
      const studentId = selectedRestoreStudent.id;

      const selectedClass = classes.find(c => c.id === restoreClassId);

      // 🔹 Fetch template for selected year
      const templateSnap = await getDocs(
        query(
          collection(DB, "billing_templates"),
          where("school_id", "==", schoolId),
          where("academic_year", "==", restoreAcademicYear)
        )
      );

      if (templateSnap.empty) {
        alert("لا يوجد قالب فواتير لهذه السنة");
        return;
      }

      const templateDoc = templateSnap.docs[0];
      const template = templateDoc.data();
      const noBilling = template.is_empty || !template.installments?.length;

      // 🔹 Fetch existing bills
      const billsSnap = await getDocs(
        query(
          collection(DB, "student_bills"),
          where("student_id", "==", studentId),
          where("academic_year", "==", restoreAcademicYear)
        )
      );

      const hasBills = !billsSnap.empty;

      // 🔹 Fetch academic record
      const recordSnap = await getDocs(
        query(
          collection(DB, "academic_records"),
          where("student_id", "==", studentId),
          where("academic_year", "==", restoreAcademicYear)
        )
      );

      const hasRecord = !recordSnap.empty;

      // 🔹 Fetch conversations
      const conversationsSnap = await getDocs(
        query(
          collection(DB, "conversations"),
          where("school_id", "==", schoolId),
          where("class_id", "==", restoreClassId),
          where("scope", "==", "class_subject")
        )
      );

      const conversationIds = conversationsSnap.docs.map(d => d.id);

      // 🔥 TRANSACTION
      await runTransaction(DB, async (transaction) => {
        const studentRef = doc(DB, "students", studentId);

        // ✅ Restore student
        transaction.update(studentRef, {
          account_deleted: false,
          class_id: restoreClassId,
          class_name: selectedClass.name,
          class_grade: selectedClass.grade,
        });

        // 🔹 CREATE RECORD IF NOT EXIST
        if (!hasRecord) {
          const recordRef = doc(collection(DB, "academic_records"));

          transaction.set(recordRef, {
            student_id: studentId,
            school_id: schoolId,
            academic_year: restoreAcademicYear,
            class_id: restoreClassId,
            class_name: selectedClass.name,
            t1: null,
            t2: null,
            t3: null,
            final_average: null,
            result: null,
            created_at: Timestamp.now(),
          });
        }

        // 🔹 CREATE BILLS IF NOT EXIST
        if (!hasBills && !noBilling) {
          const gradeName = selectedClass.grade;
          const gradeTotal = template.grade_amounts?.[gradeName];

          const numberOfPayments = template.number_of_payments;
          const totalAmount = Number(gradeTotal);

          const baseAmount = Math.floor(totalAmount / numberOfPayments);
          const remainder = totalAmount % numberOfPayments;

          template.installments.forEach((inst, index) => {
            const billRef = doc(collection(DB, "student_bills"));

            const adjustedAmount = index === 0 ? baseAmount + remainder : baseAmount;

            transaction.set(billRef, {
              student_id: studentId,
              school_id: schoolId,
              academic_year: restoreAcademicYear,
              class_id: restoreClassId,
              grade_name: gradeName,
              template_id: templateDoc.id,
              installment_index: inst.index,
              due_date: inst.due_date,
              annual_total: totalAmount,
              amount: adjustedAmount,
              status: "unpaid",
              paid_amount: 0,
              paid_at: null,
              created_at: Timestamp.now(),
            });
          });
        }

        // 🔹 ADD TO CONVERSATIONS
        conversationIds.forEach((convId) => {
          transaction.update(doc(DB, "conversations", convId), {
            participant_ids: arrayUnion(studentId),
          });
        });

      });

      alert("تم استرجاع الطالب وتنظيم بياناته بنجاح");

      setSelectedRestoreStudent(null);
      setRestoreAcademicYear("");
      setOpenDeletedModal(false);

    } catch (e) {
      console.error(e);
      alert("فشل استرجاع الطالب");
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
        </div>
      </div>

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