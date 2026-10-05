"use client";

import React, { useMemo,useState,useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {useGlobalState} from '../../../globalState';
import { supabase, rpc, enrollErrorMessage } from "../../../supabaseClient";
import PhotoUpload from "../../../components/PhotoUpload";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import { FaFemale, FaMale } from "react-icons/fa";
import { FiEdit2 } from "react-icons/fi";
import { sortClasses } from "../../../lib/sortClasses";
import "../../style.css";

const StudentDetails = () => {
    const { id } = useParams();
    const router = useRouter();

    const { students, classes, loading, refresh } = useGlobalState();

    const [deletingStudent, setDeletingStudent] = useState(false);
    const [openEditModal, setOpenEditModal] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [editName, setEditName] = useState("");
    const [editParentName, setEditParentName] = useState("");
    const [editSex, setEditSex] = useState("male");
    const [editBirthDate, setEditBirthDate] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editClassId, setEditClassId] = useState("");
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

            const { data, error } = await supabase
                .from("academic_records")
                .select("*")
                .eq("student_id", student.id);

            if (error) {
                console.error(error);
                return;
            }

            let records = [...data];

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

            if (record?.id) {
                const { error } = await supabase
                    .from("academic_records")
                    .update({ [field]: value, updated_at: new Date().toISOString() })
                    .eq("id", record.id);

                if (error) throw error;
            } else {
                const { error } = await supabase.from("academic_records").insert({
                    student_id: student.id,
                    school_id: student.school_id,
                    academic_year: record.academic_year,
                    class_id: student.class_id,
                    class_name: student.class_name,
                    t1: field === "t1" ? value : null,
                    t2: field === "t2" ? value : null,
                });

                if (error) throw error;
            }

            setEditingField(null);
            setTempValue("");

            await refresh();

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
        let nextYear = "";

        try {
            setLoadingPromotion(true);

            const { record, t1, t2, t3, average, result } = promotionData;

            nextYear = getNextAcademicYear(record.academic_year);

            let action;

            if (result === "fail") {
                // A failed student stays in the same class next year
                if (isGraduated) {
                    alert("لا يمكن تخريج طالب راسب");
                    return;
                }

                action = "repeat";
            } else if (isGraduated) {
                action = "graduate";
            } else {
                const nextClasses = getNextClasses();

                if (!nextClasses.length) {
                    alert("لا يوجد صف تالي، يمكن تخريج الطالب");
                    return;
                }

                if (!selectedNextClass) {
                    alert("يرجى اختيار الصف التالي");
                    return;
                }

                if (!nextClasses.some((c) => c.id === selectedNextClass)) {
                    alert("الصف المختار غير صالح");
                    return;
                }

                action = "promote";
            }

            // Result, next-year record, bills and class chats are saved in one database transaction
            await rpc("promote_student", {
                p_student: student.id,
                p_year: record.academic_year,
                p_t1: t1,
                p_t2: t2,
                p_t3: t3,
                p_avg: average,
                p_result: result,
                p_action: action,
                p_next_class: action === "promote" ? selectedNextClass : null,
            });

            await refresh();

            alert(
                action === "repeat"
                    ? "تم حفظ النتيجة - الطالب راسب و تم تسجيله للسنة القادمة"
                    : action === "graduate"
                    ? "تم تخريج الطالب بنجاح"
                    : "تمت الترقية بنجاح"
            );

            setOpenPromotionModal(false);

        } catch (e) {
            console.error(e);
            alert(enrollErrorMessage(e, nextYear) || "فشل العملية");
        } finally {
            setLoadingPromotion(false);
        }
    };

    //Format birthdate
    const formatDate = (timestamp) => {
        if (!timestamp) return "-";

        const date = new Date(timestamp);

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

        // birth_date is a plain YYYY-MM-DD date, which is what the date input expects
        setEditBirthDate(student.birth_date || "");

        let rawPhone = student.phone_number || "";

        if (rawPhone.startsWith("+964")) {
            rawPhone = rawPhone.replace("+964", "");
        }

        setEditPhone(rawPhone);

        setEditClassId(student.class_id || "");

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

            if (!editName.trim() || !editPhone || !editBirthDate) {
                alert("يرجى إدخال الاسم ورقم الهاتف وتاريخ الميلاد");
                return;
            }

            const phoneError = validatePhoneNumber(editPhone);
            if (phoneError) {
                alert(phoneError);
                return;
            }

            const newClass = classes.find((c) => c.id === editClassId);
            const classChanged = !!newClass && newClass.id !== editingStudent.class_id;

            // Bills are priced per grade, so a student with bills cannot be moved silently
            if (classChanged) {
                const { count } = await supabase
                    .from("student_bills")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", editingStudent.id);

                if (count > 0) {
                    alert("لا يمكن تغيير الصف لطالب لديه فواتير");
                    return;
                }
            }

            const { error } = await supabase
                .from("students")
                .update({
                    name: editName.trim(),
                    parent_name: editParentName.trim(),
                    phone_number: `+964${editPhone}`,
                    sex: editSex,
                    birth_date: editBirthDate,
                    birth_date_estimated: false,
                })
                .eq("id", editingStudent.id);

            if (error) throw error;

            if (classChanged) {
                await rpc("move_student_to_class", {
                    p_student: editingStudent.id,
                    p_class: newClass.id,
                    p_year: getAcademicYearAuto(),
                });
            }

            await refresh();

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

        try {
            setDeletingStudent(true);

            // Soft delete, removal from the class chats and freeing the transport seat, in one transaction
            await rpc("delete_student", { p_student: studentID });

            await refresh();

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
                <PhotoUpload
                    bucket="student-photos"
                    table="students"
                    schoolId={student.school_id}
                    recordId={student.id}
                    photoPath={student.photo_path}
                    photoUrl={student.photo_url}
                    fallback={
                        <div className="student-avatar">
                            {student.sex === "female" ? <FaFemale size={36}/> : <FaMale size={36} />}
                        </div>
                    }
                />
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

                    {editingStudent?.birth_date_estimated && (
                        <p className="modal-hint">تاريخ الميلاد الحالي تقديري، يرجى إدخال التاريخ الصحيح.</p>
                    )}

                    <select value={editClassId} onChange={(e) => setEditClassId(e.target.value)}>
                        {sortClasses(classes).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

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