"use client";

import React, { useMemo,useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {useGlobalState} from '../../../globalState';
import {collection,getDocs,query,where,doc,runTransaction,serverTimestamp,Timestamp,arrayUnion} from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import { FaFemale, FaMale } from "react-icons/fa";
import "../../style.css";

const StudentRequestDetails = () => {
    const { id } = useParams();
    const router = useRouter();

    const { studentsRequests, classes, loading } = useGlobalState();
    const [openAcceptModal, setOpenAcceptModal] = useState(false);
    const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
    const [selectedClassId, setSelectedClassId] = useState("");
    const [loadingAccept, setLoadingAccept] = useState(false);
    const [deletingRequest, setDeletingRequest] = useState(false);

    //Academic year
    const getAcademicYearAuto = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    };

        //Next academic year
    const getNextAcademicYear = (year) => {
        const start = parseInt(year.split("-")[0]);
        return `${start + 1}-${start + 2}`;
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
    
    //Find student
    const studentRequest = useMemo(() => {
        return studentsRequests.find((s) => s.id === id);
    }, [studentsRequests, id]);

    //Filter classes based on request grade
    const filteredClasses = useMemo(() => {
        if (!studentRequest) return [];

        return classes.filter(
            (c) => c.grade === studentRequest.requested_grade
        );
    }, [classes, studentRequest]);

    //Open accept request modal
    const openAcceptRequestModal = () => {
        setSelectedAcademicYear(getAcademicYearAuto());
        setSelectedClassId("");
        setOpenAcceptModal(true);
    };

    //Accept the request
    const handleAcceptRequest = async () => {
        try {
            setLoadingAccept(true);

            if (!selectedAcademicYear) {
                alert("يرجى اختيار السنة الدراسية");
                return;
            }

            if (!selectedClassId) {
                alert("يرجى اختيار الصف");
                return;
            }

            const schoolId = localStorage.getItem("adminSchoolID");
            const schoolName = localStorage.getItem("adminSchoolName");
            const logo = localStorage.getItem("schoolLogo");
            const country = localStorage.getItem("schoolCountry") || "iraq";

            // 🔹 selected class
            const selectedClass = classes.find(c => c.id === selectedClassId);

            // 🔹 check billing template
            const templatesSnap = await getDocs(
                query(
                    collection(DB, "billing_templates"),
                    where("school_id", "==", schoolId),
                    where("academic_year", "==", selectedAcademicYear)
                )
            );

            if (templatesSnap.empty) {
                alert(`لا يوجد قالب فواتير للسنة ${selectedAcademicYear}`);
                return;
            }

            const templateDoc = templatesSnap.docs[0];
            const template = templateDoc.data();
            const noBilling = template.is_empty || !template.installments?.length;

            // 🔹 fetch conversations BEFORE transaction
            const conversationsSnap = await getDocs(
                query(
                    collection(DB, "conversations"),
                    where("school_id", "==", schoolId),
                    where("class_id", "==", selectedClassId),
                    where("scope", "==", "class_subject")
                )
            );

            const conversationIds = conversationsSnap.docs.map(d => d.id);

            // 🔥 TRANSACTION
            await runTransaction(DB, async (transaction) => {
                const schoolRef = doc(DB, "schools", schoolId);
                const schoolSnap = await transaction.get(schoolRef);

                if (!schoolSnap.exists()) throw new Error("SCHOOL_NOT_FOUND");

                const schoolData = schoolSnap.data();

                // 🔹 create student
                const studentRef = doc(collection(DB, "students"));
                const studentId = studentRef.id;

                transaction.set(studentRef, {
                    name: studentRequest.name,
                    parent_name: studentRequest.parent_name,
                    phone_number: studentRequest.phone_number,
                    sex: studentRequest.sex,
                    birth_date: studentRequest.birth_date,
                    destination: schoolName,
                    destination_location: {
                        latitude: Number(schoolData.location.latitude),
                        longitude: Number(schoolData.location.longitude),
                    },
                    school_id: schoolId,
                    school_logo: logo,
                    class_id: selectedClassId,
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
                    graduated: false,
                    country: country,
                    notification_token: null,
                    created_at: serverTimestamp(),
                });

                // 🔹 academic record
                const recordRef = doc(collection(DB, "academic_records"));

                transaction.set(recordRef, {
                    student_id: studentId,
                    school_id: schoolId,
                    academic_year: selectedAcademicYear,
                    class_id: selectedClassId,
                    class_name: selectedClass.name,
                    t1: null,
                    t2: null,
                    t3: null,
                    final_average: null,
                    result: null,
                    created_at: Timestamp.now(),
                });

                // 🔹 bills
                const gradeTotal = template.grade_amounts?.[selectedClass.grade];

                if (!noBilling && !gradeTotal) throw new Error("GRADE_AMOUNT_NOT_FOUND");

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
                        academic_year: selectedAcademicYear,
                        class_id: selectedClassId,
                        grade_name: selectedClass.grade,
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

                // 🔹 conversations
                conversationIds.forEach((convId) => {
                    transaction.update(doc(DB, "conversations", convId), {
                        participant_ids: arrayUnion(studentId),
                    });
                });

                // 🔥 DELETE REQUEST
                transaction.delete(doc(DB, "students_requests", studentRequest.id));
            });

            alert("تم قبول الطلب وإنشاء الطالب");

            setOpenAcceptModal(false);
            router.push("/");

        } catch (e) {
            console.error(e);
            alert("فشل قبول الطلب");
        } finally {
            setLoadingAccept(false);
        }
    };

    //Reject the request (delete it)
    const handleDeleteRequest = async (id) => {
        try {
            setDeletingRequest(true);

            await deleteDoc(doc(DB, "students_requests", id));

            alert("تم حذف الطلب");
            router.push("/");

        } catch (e) {
            console.error(e);
            alert("فشل حذف الطلب");
        } finally {
            setDeletingRequest(false);
        }
    };


    if (loading || !studentRequest) {
        return (
            <div className="loader">
                <ClipLoader />
            </div>
        );
    }

    return (
        <div className="student-details-container">
            <div className="card student-header" style={{padding:'10px'}}>
                <div className="student-avatar">
                    {studentRequest.sex === "female" ? <FaFemale size={36}/> : <FaMale size={36} />}
                </div>
                <div className="student-details-info">
                    <h3>{studentRequest.name} {studentRequest.parent_name}</h3>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>تفاصيل الطلب</h3>
                </div>

                <div className="card-content details-grid">
                    <Detail label="الاسم" value={`${studentRequest.name} ${studentRequest.parent_name}`} />
                    <Detail label="طلب التسجيل بصف" value={studentRequest.requested_grade} />
                    <Detail label="تاريخ التسجيل" value={formatDate(studentRequest.request_date)}/>
                    <Detail label="رقم الهاتف" value={studentRequest.phone_number || "-"} />
                    <Detail label="تاريخ الميلاد" value={formatDate(studentRequest.birth_date)} />
                </div>
            </div>

            <div className="student-details-delete-btn-box">
                <button
                    className="student-details-delete-btn"
                    style={{backgroundColor:'#ef4444'}}
                    onClick={() => handleDeleteRequest(studentRequest.id, router)}
                > 
                    {deletingRequest ? (
                        <ClipLoader size={15} color="#fff" />
                    ) : (
                        "حذف الطلب"
                    )}
                </button>

                <button 
                    className="student-details-delete-btn"
                    style={{backgroundColor:'#008CBA'}}
                    onClick={() => openAcceptRequestModal(studentRequest)}
                >
                     قبول الطلب
                </button>
            </div>

            <Modal
                title="قبول الطلب"
                open={openAcceptModal}
                onCancel={() => setOpenAcceptModal(false)}
                footer={null}
                centered
            >
                <div className="create-school-form">
                    <select
                        value={selectedAcademicYear}
                        onChange={(e) => setSelectedAcademicYear(e.target.value)}
                    >
                        <option value={getAcademicYearAuto()}>
                            {getAcademicYearAuto()}
                        </option>
                        <option value={getNextAcademicYear(getAcademicYearAuto())}>
                            {getNextAcademicYear(getAcademicYearAuto())}
                        </option>
                    </select>

                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                        <option value="">اختر الصف</option>
                        {filteredClasses.map(cls => (
                            <option key={cls.id} value={cls.id}>
                            {cls.name}
                            </option>
                        ))}
                    </select>

                    <button
                        className="create-submit"
                        onClick={handleAcceptRequest}
                    >
                        {loadingAccept ? <ClipLoader size={15} color="#fff"/> : "تأكيد"}
                    </button>

                </div>
            </Modal>
        </div>
    );
};

export default StudentRequestDetails;

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