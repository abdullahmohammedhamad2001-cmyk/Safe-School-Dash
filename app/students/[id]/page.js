"use client";

import React, { useMemo,useState,useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {useGlobalState} from '../../../globalState';
import { doc, updateDoc,setDoc,getDoc,getDocs,query,where,collection,Timestamp,runTransaction,arrayRemove,arrayUnion } from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import { FaFemale, FaMale } from "react-icons/fa";
import { FiEdit2 } from "react-icons/fi";
import "../../style.css";

const StudentDetails = () => {
    const { id } = useParams();
    const router = useRouter();

    const { students, classes, loading } = useGlobalState();

    const [deletingStudent, setDeletingStudent] = useState(false);
    const [openEditModal, setOpenEditModal] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [editName, setEditName] = useState("");
    const [editParentName, setEditParentName] = useState("");
    const [editSex, setEditSex] = useState("male");
    const [editBirthDate, setEditBirthDate] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editClassName, setEditClassName] = useState("");
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [tempValue, setTempValue] = useState("");
    const [loadingSave, setLoadingSave] = useState(false);
    const [academicRecords, setAcademicRecords] = useState([]);
    const [openPromotionModal, setOpenPromotionModal] = useState(false);
    const [promotionData, setPromotionData] = useState(null);
    const [selectedNextClass, setSelectedNextClass] = useState("");
    const [isGraduated, setIsGraduated] = useState(false);
    const [loadingPromotion, setLoadingPromotion] = useState(false);

    //Academic year
    const getAcademicYearAuto = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    };
    
    //Find student
    const student = useMemo(() => {
        return students.find((s) => s.id === id);
    }, [students, id]);

    //Find class name
    const className = useMemo(() => {
        const cls = classes.find((c) => c.id === student?.class_id);
        return cls?.name || "-";
    }, [classes, student]);

    //Fetch student yearly results
    useEffect(() => {
        const fetchRecords = async () => {
            if (!student) return;

            const snap = await getDocs(
                query(
                    collection(DB, "academic_records"),
                    where("student_id", "==", student.id)
                )
            );

            let records = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            //sort by academic year DESC
            records.sort((a, b) => {
                const yearA = parseInt(a.academic_year.split("-")[0]);
                const yearB = parseInt(b.academic_year.split("-")[0]);
                return yearB - yearA;
            });

            //ensure current year exists
            const currentYear = getAcademicYearAuto();

            const hasCurrent = records.some(r => r.academic_year === currentYear);

            if (!hasCurrent) {
                records.unshift({
                    academic_year: currentYear,
                    isNew: true
                });
            }

            setAcademicRecords(records);
        };

        fetchRecords();
    }, [student]);

    //Save record result
    const handleSaveField = async (field, record) => {
        try {
            setLoadingSave(true);

            const value = Number(tempValue);

            if (isNaN(value)) {
                alert("القيمة غير صحيحة");
                return;
            }

            if (field === "t3") {
                const t1 = record?.t1;
                const t2 = record?.t2;
                const t3 = value;

                if (!t1 || !t2) {
                    alert("يجب إدخال الفصل الأول و الثاني أولا");
                    return;
                }

                const avgRaw = (t1 + t2 + t3) / 3;
                const avg = Number(avgRaw.toFixed(2));
                const result = avgRaw >= 50 ? "pass" : "fail";

                setPromotionData({
                    record,
                    t1,
                    t2,
                    t3,
                    average: avg,
                    result
                });

                setOpenPromotionModal(true);
                setEditingField(null);
                setTempValue("");
                setLoadingSave(false);

                return;
            }

            const recordRef = record?.id
                ? doc(DB, "academic_records", record.id)
                : doc(collection(DB, "academic_records"));

            if (record?.id) {
                await updateDoc(recordRef, {
                    [field]: value,
                    updated_at: Timestamp.now(),
                });
            } else {
                await setDoc(recordRef, {
                    student_id: student.id,
                    school_id: student.school_id,
                    academic_year: record.academic_year,
                    class_id: student.class_id,
                    class_name: student.class_name,
                    t1: field === "t1" ? value : null,
                    t2: field === "t2" ? value : null,
                    t3: field === "t3" ? value : null,
                    final_average: null,
                    result: null,
                    created_at: Timestamp.now(),
                });
            }

            setEditingField(null);
            setTempValue("");

        } catch (e) {
            console.error(e);
            alert("فشل الحفظ");
        } finally {
            setLoadingSave(false);
        }
    };

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

    const getNextClasses = () => {
        const currentClass = classes.find(c => c.id === student.class_id);
        if (!currentClass) return [];

        const levelGrades = GRADES_BY_LEVEL[currentClass.educationLevel] || [];

        // 🔹 find current grade index
        const currentIndex = levelGrades.indexOf(currentClass.grade);

        // 🔹 next grade
        const nextGrade = levelGrades[currentIndex + 1];

        if (!nextGrade) return []; // last grade (no next)

        return classes.filter(c =>
            c.educationLevel === currentClass.educationLevel &&
            c.grade === nextGrade
        );
    };

    //Next academic year
    const getNextAcademicYear = (year) => {
        const start = parseInt(year.split("-")[0]);
        return `${start + 1}-${start + 2}`;
    };

    const handleConfirmPromotion = async () => {
        try {
            setLoadingPromotion(true);

            const { record, t1, t2, t3, average, result } = promotionData;

            const recordRef = record?.id
                ? doc(DB, "academic_records", record.id)
                : doc(collection(DB, "academic_records"));

            const studentRef = doc(DB, "students", student.id);

            const nextYear = getNextAcademicYear(record.academic_year);

            //CASE 3: FAIL → stay in same class
            if (result === "fail") {

                if (isGraduated) {
                    alert("لا يمكن تخريج طالب راسب");
                    setLoadingPromotion(false);
                    return;
                }

                const nextYear = getNextAcademicYear(record.academic_year);

                // 🔹 Billing template
                const templatesSnap = await getDocs(
                    query(
                        collection(DB, "billing_templates"),
                        where("school_id", "==", student.school_id),
                        where("academic_year", "==", nextYear)
                    )
                );

                if (templatesSnap.empty) {
                    alert(`لا يوجد قالب فواتير للسنة ${nextYear}`);
                    setLoadingPromotion(false);
                    return;
                }

                const templateDoc = templatesSnap.docs[0];
                const template = templateDoc.data();

                await runTransaction(DB, async (transaction) => {

                    // Save current year result
                    transaction.set(recordRef, {
                        student_id: student.id,
                        school_id: student.school_id,
                        academic_year: record.academic_year,
                        class_id: student.class_id,
                        class_name: student.class_name,
                        t1,
                        t2,
                        t3,
                        final_average: average,
                        result,
                        created_at: Timestamp.now(),
                    }, { merge: true });

                    // Create next academic record (same class)
                    const newRecordRef = doc(collection(DB, "academic_records"));

                    transaction.set(newRecordRef, {
                        student_id: student.id,
                        school_id: student.school_id,
                        academic_year: nextYear,
                        class_id: student.class_id,
                        class_name: student.class_name,
                        t1: null,
                        t2: null,
                        t3: null,
                        final_average: null,
                        result: null,
                        created_at: Timestamp.now(),
                    });

                    //Create bills (same grade)
                    const gradeName = student.class_grade;
                    const gradeTotal = template.grade_amounts?.[gradeName];

                    if (!gradeTotal) throw new Error("GRADE_AMOUNT_NOT_FOUND");

                    const numberOfPayments = template.number_of_payments;
                    const totalAmount = Number(gradeTotal);
                    const baseAmount = Math.floor(totalAmount / numberOfPayments);
                    const remainder = totalAmount % numberOfPayments;

                    template.installments.forEach((inst, index) => {
                        const billRef = doc(collection(DB, "student_bills"));

                        const amount = index === 0 ? baseAmount + remainder : baseAmount;

                        transaction.set(billRef, {
                            student_id: student.id,
                            school_id: student.school_id,
                            academic_year: nextYear,
                            class_id: student.class_id,
                            grade_name: gradeName,
                            template_id: templateDoc.id,
                            installment_index: inst.index,
                            due_date: inst.due_date,
                            annual_total: totalAmount,
                            amount,
                            status: "unpaid",
                            paid_amount: 0,
                            paid_at: null,
                            created_at: Timestamp.now(),
                        });
                    });

                });

                alert("تم حفظ النتيجة - الطالب راسب و تم تسجيله للسنة القادمة");

                setOpenPromotionModal(false);
                return;
            }

            // 🟢 CASE 2: PASS + GRADUATED
            if (result === "pass" && isGraduated) {
                await runTransaction(DB, async (transaction) => {
                    transaction.set(recordRef, {
                        student_id: student.id,
                        school_id: student.school_id,
                        academic_year: record.academic_year,
                        class_id: student.class_id,
                        class_name: student.class_name,
                        t1,
                        t2,
                        t3,
                        final_average: average,
                        result,
                        created_at: Timestamp.now(),
                    }, { merge: true });

                    transaction.update(studentRef, {
                        graduated: true,
                    });
                });

                alert("تم تخريج الطالب بنجاح");
                setOpenPromotionModal(false);
                return;
            }

            // 🟢 CASE 1: PASS → move to next class automatically
            const nextClasses = getNextClasses();

            if (!nextClasses.length) {
                alert("لا يوجد صف تالي، يمكن تخريج الطالب");
                setLoadingPromotion(false);
                return;
            }

            // ❗ enforce selection
            if (!selectedNextClass) {
                alert("يرجى اختيار الصف التالي");
                setLoadingPromotion(false);
                return;
            }

            const nextClass = nextClasses.find(c => c.id === selectedNextClass);

            if (!nextClass) {
                alert("الصف المختار غير صالح");
                setLoadingPromotion(false);
                return;
            }

            // 🔹 Billing template
            const templatesSnap = await getDocs(
            query(
                collection(DB, "billing_templates"),
                where("school_id", "==", student.school_id),
                where("academic_year", "==", nextYear)
            )
            );

            if (templatesSnap.empty) {
                alert(`لا يوجد قالب فواتير للسنة ${nextYear}`);
                setLoadingPromotion(false);
                return;
            }

            const templateDoc = templatesSnap.docs[0];
            const template = templateDoc.data();

            // 🔹 Conversations
            const oldConvSnap = await getDocs(
                query(
                    collection(DB, "conversations"),
                    where("school_id", "==", student.school_id),
                    where("class_id", "==", student.class_id),
                    where("scope", "==", "class_subject")
                )
            );

            const newConvSnap = await getDocs(
                query(
                    collection(DB, "conversations"),
                    where("school_id", "==", student.school_id),
                    where("class_id", "==", nextClass.id),
                    where("scope", "==", "class_subject")
                )
            );

            await runTransaction(DB, async (transaction) => {

                // ✅ Save result
                transaction.set(recordRef, {
                    student_id: student.id,
                    school_id: student.school_id,
                    academic_year: record.academic_year,
                    class_id: student.class_id,
                    class_name: student.class_name,
                    t1,
                    t2,
                    t3,
                    final_average: average,
                    result,
                    created_at: Timestamp.now(),
                }, { merge: true });

                // ✅ Update student class
                transaction.update(studentRef, {
                    class_id: nextClass.id,
                    class_name: nextClass.name,
                    class_grade: nextClass.grade,
                });

                // ✅ Create next year record
                const newRecordRef = doc(collection(DB, "academic_records"));

                transaction.set(newRecordRef, {
                    student_id: student.id,
                    school_id: student.school_id,
                    academic_year: nextYear,
                    class_id: nextClass.id,
                    class_name: nextClass.name,
                    t1: null,
                    t2: null,
                    t3: null,
                    final_average: null,
                    result: null,
                    created_at: Timestamp.now(),
                });

                // ✅ Bills
                const gradeTotal = template.grade_amounts?.[nextClass.grade];
                if (!gradeTotal) throw new Error("GRADE_AMOUNT_NOT_FOUND");

                const numberOfPayments = template.number_of_payments;
                const totalAmount = Number(gradeTotal);
                const baseAmount = Math.floor(totalAmount / numberOfPayments);
                const remainder = totalAmount % numberOfPayments;

                template.installments.forEach((inst, index) => {
                    const billRef = doc(collection(DB, "student_bills"));

                    const amount = index === 0 ? baseAmount + remainder : baseAmount;

                    transaction.set(billRef, {
                        student_id: student.id,
                        school_id: student.school_id,
                        academic_year: nextYear,
                        class_id: nextClass.id,
                        grade_name: nextClass.grade,
                        template_id: templateDoc.id,
                        installment_index: inst.index,
                        due_date: inst.due_date,
                        annual_total: totalAmount,
                        amount,
                        status: "unpaid",
                        paid_amount: 0,
                        paid_at: null,
                        created_at: Timestamp.now(),
                    });
                });

                // ✅ Conversations
                oldConvSnap.docs.forEach((docSnap) => {
                    transaction.update(doc(DB, "conversations", docSnap.id), {
                    participant_ids: arrayRemove(student.id),
                    });
                });

                newConvSnap.docs.forEach((docSnap) => {
                    transaction.update(doc(DB, "conversations", docSnap.id), {
                    participant_ids: arrayUnion(student.id),
                    });
                });

            });

            alert("تمت الترقية بنجاح");
            setOpenPromotionModal(false);

        } catch (e) {
            console.error(e);
            alert("فشل العملية");
        } finally {
            setLoadingPromotion(false);
        }
    };

    //Format birthdate
    const formatDate = (timestamp) => {
        if (!timestamp) return "-";

        const date = timestamp.toDate();

        return date.toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    //Edit student data
    const openEditStudent = (student) => {
        setEditingStudent(student);
        setEditName(student.name || "");
        setEditParentName(student.parent_name || "");
        setEditSex(student.sex || "male");

        // 🔥 convert timestamp → input date
        if (student.birth_date) {
            const d = student.birth_date.toDate();
            const formatted = d.toISOString().split("T")[0];
            setEditBirthDate(formatted);
        }

        let rawPhone = student.phone_number || "";

        if (rawPhone.startsWith("+964")) {
            rawPhone = rawPhone.replace("+964", "");
        }

        setEditPhone(rawPhone);

        setEditClassName(student.class_name || "");

        setOpenEditModal(true);
    };

    //Validate phone number
    const validatePhoneNumber = (phone) => {
        if (!phone) return "الرجاء إدخال رقم الهاتف";
        
        if (phone.length !== 10) return "رقم الهاتف يجب أن يتكون من 10 أرقام";
        if (!phone.startsWith("7")) return "رقم الهاتف يجب أن يبدأ بالرقم 7";

        return null;
    };

    //Save edit student info
    const handleUpdateStudent = async () => {
        try {
            setLoadingEdit(true);

            if (!editName || !editParentName || !editPhone || !editBirthDate) {
                alert("يرجى إدخال جميع البيانات");
                return;
            }

            const phoneError = validatePhoneNumber(editPhone);
            if (phoneError) {
                alert(phoneError);
                return;
            }

            const birthDate = Timestamp.fromDate(new Date(editBirthDate));

            await updateDoc(doc(DB, "students", editingStudent.id), {
                name: editName.trim(),
                parent_name: editParentName.trim(),
                phone_number: `+964${editPhone}`,
                sex: editSex,
                birth_date: birthDate,
            });

            alert("تم تحديث بيانات الطالب");
            setOpenEditModal(false);
        } catch (e) {
            console.error(e);
            alert("فشل التحديث");
        } finally {
            setLoadingEdit(false);
        }
    };

    //Delete student account
    const handleDelete = async (studentID, router) => {
        const confirmDelete = confirm("هل أنت متأكد من حذف هذا الحساب؟");
        if (!confirmDelete) return;

        const adminId = localStorage.getItem("adminSchoolID");

        try {
            setDeletingStudent(true);

            const studentRef = doc(DB, "students", studentID);

            // 🔹 Get student data FIRST
            const studentSnap = await getDoc(studentRef);

            if (!studentSnap.exists()) {
                alert("الطالب غير موجود");
                return;
            }

            const studentData = studentSnap.data();

            const schoolId = studentData.school_id;
            const classId = studentData.class_id;

            // 🔹 Get ALL class conversations
            const conversationsSnap = await getDocs(
                query(
                    collection(DB, "conversations"),
                    where("school_id", "==", schoolId),
                    where("class_id", "==", classId),
                    where("scope", "==", "class_subject"),
                )
            );

            const conversationIds = conversationsSnap.docs.map(d => d.id);

            //TRANSACTION
            await runTransaction(DB, async (transaction) => {

                //Remove student from conversations
                conversationIds.forEach((convId) => {
                    transaction.update(doc(DB, "conversations", convId), {
                        participant_ids: arrayRemove(studentID),
                    });
                });

                //Soft delete student
                transaction.update(studentRef, {
                    account_deleted: true,
                    deleted_at: Timestamp.now(),
                    deleted_by: adminId,
                });

            });

            alert("تم حذف الحساب بنجاح");

            router.push("/");

        } catch (e) {
            console.error(e);
            alert("فشل حذف الحساب");
        } finally {
            setDeletingStudent(false);
        }
    };

    if (loading || !student) {
        return (
            <div className="loader">
                <ClipLoader />
            </div>
        );
    }

    return (
        <div className="student-details-container">
            <div className="card student-header">
                <div className="student-avatar">
                    {student.sex === "female" ? <FaFemale size={36}/> : <FaMale size={36} />}
                </div>
                <div className="student-details-info">
                    <h3>{student.name} {student.parent_name}</h3>
                    <p className="sub-text">{className}</p>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>معلومات الطالب</h3>
                </div>

                <div className="card-content details-grid">
                    <Detail label="الاسم" value={`${student.name} ${student.parent_name}`} />
                    <Detail label="الصف" value={className} />
                    <Detail label="تاريخ الميلاد" value={formatDate(student.birth_date)} />
                    <Detail label="رقم الهاتف" value={student.phone_number || "-"} />
                    <Detail label="المعرف الوحيد" value={student.id} />
                    <Detail
                        label="مرتبط بحساب ولي أمر"
                        value={student.linked_parent ? "نعم" : "لا"}
                        status={student.linked_parent ? true : false}
                    />
                </div>
            </div>

            <div className="card">
                <div className="card-result-header">
                    <h3>النتائج الدراسية</h3>
                </div>

                <div className="card-content">
                    {academicRecords.map((record, idx) => (
                        <div key={record.academic_year} className="academic-year-block">
                            <div className="academic-year-header">
                                <h4>{record.academic_year}</h4>
                                <div className="academic-class-name">
                                    {record?.class_name || "-"}
                                </div>
                                {idx === 0 && (
                                    <span className="current-year-badge">
                                     السنة الحالية
                                    </span>
                                )}
                            </div>
                            <div className="results-row">
                                {["t1", "t2", "t3"].map((field, index) => (
                                    <div key={field} className="result-box">

                                        <span className="result-label">
                                            {index === 0 ? "الفصل الأول" :
                                            index === 1 ? "الفصل الثاني" : "الفصل الثالث"}
                                        </span>

                                        {editingField === `${record.academic_year}-${field}` ? (
                                            <div className="edit-row">
                                                <input
                                                    type="number"
                                                    value={tempValue}
                                                    onChange={(e) => setTempValue(e.target.value)}
                                                />

                                                <button
                                                    className="result-box-edit-row-save-btn"
                                                    style={{ backgroundColor: "#8a6115", color: "#fff", marginLeft: 10 }}
                                                    onClick={() => handleSaveField(field, record)}
                                                >
                                                    {loadingSave ? <ClipLoader size={12} color="#fff"/> : "حفظ"}
                                                </button>

                                                <button
                                                    className="result-box-edit-row-save-btn"
                                                    onClick={() => {
                                                    setEditingField(null);
                                                    setTempValue("");
                                                    }}
                                                >
                                                 الغاء
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="value-row">
                                                <span
                                                    className={`grade-badge ${
                                                        record?.[field] == null
                                                        ? "empty"
                                                        : record[field] >= 50
                                                        ? "success"
                                                        : "fail"
                                                    }`}
                                                >
                                                    {record?.[field] ?? "-"}
                                                </span>

                                                {idx === 0 && (
                                                    <div
                                                        className="value-row-edit-button"
                                                        onClick={() => {
                                                            const t1 = record?.t1;
                                                            const t2 = record?.t2;

                                                            if (field === "t2" && !t1) {
                                                                alert("يجب إدخال نتيجة الفصل الأول أولا");
                                                                return;
                                                            }

                                                            if (field === "t3" && !t2) {
                                                                alert("يجب إدخال نتيجة الفصل الثاني أولا");
                                                                return;
                                                            }

                                                            setEditingField(`${record.academic_year}-${field}`);
                                                            setTempValue(record?.[field] || "");
                                                        }}
                                                    >
                                                        <FiEdit2 fontSize={16}/>
                                                        <p>{record?.[field] ? "تعديل" : "إضافة"}</p>
                                                    </div>
                                                )}

                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {record?.t1 != null && record?.t2 != null && record?.t3 != null && (
                                <div className="final-result-box">
                                    <div className="final-average">
                                        <span>المعدل النهائي</span>
                                        <h4 className={`final-badge ${record.final_average >= 50 ? "success" : "fail"}`}>
                                            {record.final_average?.toFixed(2) || "-"}
                                        </h4>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <Modal
                    open={openPromotionModal}
                    onCancel={() => setOpenPromotionModal(false)}
                    footer={null}
                    centered
                >
                    <div className="promotion-modal">
                        <h3>نتيجة الطالب</h3>
                        <div className="promotion-results">
                            <p>الفصل الأول: {promotionData?.t1}</p>
                            <p>الفصل الثاني: {promotionData?.t2}</p>
                            <p>الفصل الثالث: {promotionData?.t3}</p>
                        </div>
                        <h2>المعدل: {promotionData?.average}</h2>

                        <div>
                            <h2 className={`promotion-status ${promotionData?.result}`}>
                                {promotionData?.result === "pass" ? "ناجح" : "راسب"}
                            </h2>
                        </div>

                        {promotionData?.result === "pass" && (
                            <div className="promotion-decision-modal">
                                <select
                                    value={selectedNextClass}
                                    onChange={(e) => {
                                        setSelectedNextClass(e.target.value);
                                        setIsGraduated(false); // prevent conflict
                                    }}
                                    disabled={isGraduated}
                                >
                                    <option value="">اختر الصف التالي</option>
                                    {getNextClasses().map(cls => (
                                        <option key={cls.id} value={cls.id}>
                                        {cls.name}
                                        </option>
                                    ))}
                                </select>

                                <div className="graduation-check">
                                    <input
                                        type="checkbox"
                                        checked={isGraduated}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setIsGraduated(checked);
                                            if (checked) {setSelectedNextClass("");}
                                        }}
                                    />
                                    <label>تخرج</label>
                                </div>
                            </div>
                        )}
                        
                        <button onClick={handleConfirmPromotion} className="create-submit">
                            {loadingPromotion ? <ClipLoader size={15} color="#fff"/> : "تأكيد"}
                        </button>
                    </div>
                </Modal>
            </div>

            <div className="student-details-delete-btn-box">
                <button
                    className="student-details-delete-btn"
                    style={{backgroundColor:'#ef4444'}}
                    onClick={() => handleDelete(student.id, router)}
                > 
                    {deletingStudent ? (
                        <ClipLoader size={15} color="#fff" />
                    ) : (
                        "حذف الحساب"
                    )}
                </button>

                <button 
                    className="student-details-delete-btn"
                    style={{backgroundColor:'#008CBA'}}
                    onClick={() => openEditStudent(student)}
                >
                    تعديل البيانات
                </button>
            </div>

            <Modal
                title="تعديل بيانات الطالب"
                open={openEditModal}
                onCancel={() => setOpenEditModal(false)}
                footer={null}
                centered
            >
                <div className="create-school-form">
                    <input
                        placeholder="اسم الطالب"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                    />
                    <input
                        placeholder="اسم ولي الامر"
                        value={editParentName}
                        onChange={(e) => setEditParentName(e.target.value)}
                    />

                    <select
                        value={editSex}
                        onChange={(e) => setEditSex(e.target.value)}
                    >
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>

                    <div className="input-group">
                        <label>تاريخ الميلاد</label>
                        <input
                            type="date"
                            value={editBirthDate}
                            onChange={(e) => setEditBirthDate(e.target.value)}
                        />
                    </div>

                    <input
                        placeholder="رقم الهاتف"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value.replace(/[^0-9]/g, ""))}
                    />

                    <input value={editClassName} disabled />

                    {loadingEdit ? (
                        <div className="btn-loading">
                            <ClipLoader size={15} color="#fff" />
                        </div>
                    ) : (
                        <button className="create-submit" onClick={handleUpdateStudent}>
                         حفظ التعديلات
                        </button>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default StudentDetails;

const Detail = ({ label, value, status }) => {
    return (
        <div className="detail-item">
            <span className="label">{label}</span>
            <span 
                className={
                    `value ${status === true ? "yes" : status === false ? "no" : ""} ${label === "رقم الهاتف" ? 'phone-number' : ''}`
                }>
                {value}
            </span>
        </div>
    );
};