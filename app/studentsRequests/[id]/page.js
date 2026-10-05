"use client";

import React, { useMemo,useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {useGlobalState} from '../../../globalState';
import { supabase, rpc, enrollErrorMessage } from "../../../supabaseClient";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import { FaFemale, FaMale } from "react-icons/fa";
import "../../style.css";

const StudentRequestDetails = () => {
    const { id } = useParams();
    const router = useRouter();

    const { studentsRequests, classes, loading, refresh } = useGlobalState();
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

        const date = new Date(timestamp);

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

            // Creates the student, yearly record, bills and class chats, then removes the request, in one transaction
            await rpc("accept_student_request", {
                p_request: studentRequest.id,
                p_class: selectedClassId,
                p_year: selectedAcademicYear,
            });

            await refresh();

            alert("تم قبول الطلب وإنشاء الطالب");

            setOpenAcceptModal(false);
            router.push("/");

        } catch (e) {
            console.error(e);
            alert(enrollErrorMessage(e, selectedAcademicYear) || "فشل قبول الطلب");
        } finally {
            setLoadingAccept(false);
        }
    };

    //Reject the request (delete it)
    const handleDeleteRequest = async (id) => {
        try {
            setDeletingRequest(true);

            const { error } = await supabase.from("students_requests").delete().eq("id", id);

            if (error) throw error;

            await refresh();

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