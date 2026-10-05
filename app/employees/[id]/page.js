"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGlobalState } from "../../../globalState";
import { rpc, adminAccounts } from "../../../supabaseClient";
import PhotoUpload from "../../../components/PhotoUpload";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import { FaUser } from "react-icons/fa";
import "../../style.css";

const EmployeeDetails = () => {
    const { id } = useParams();
    const router = useRouter();

    const { employees, loading, refresh } = useGlobalState();

    const [credentials, setCredentials] = useState(null);
    const [resetting, setResetting] = useState(false);

    // Passwords are not stored in readable form; this issues a new one
    const handleResetPassword = async () => {
        if (!employee.profile_id) {
            alert("لا يوجد حساب دخول مرتبط بهذا الموظف");
            return;
        }

        if (!confirm("هل تريد إنشاء كلمة مرور جديدة لهذا الموظف؟")) return;

        try {
            setResetting(true);
            const result = await adminAccounts({ action: "reset_password", profileId: employee.profile_id });
            setCredentials({ username: result.username, password: result.password });
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء تغيير كلمة المرور");
        } finally {
            setResetting(false);
        }
    };

    const [openEditModal, setOpenEditModal] = useState(false);
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [editName, setEditName] = useState("");
    const [deletingEmployee, setDeletingEmployee] = useState(false);

    // Find employee
    const employee = useMemo(() => {
        return employees.find((t) => t.id === id);
    }, [employees, id]);

    //Open edit modal
    const openEditTeacher = () => {
        setEditName(employee.name || "");
        setOpenEditModal(true);
    };


    //Update employee data
    const handleUpdateEmployee = async () => {
        try {
            setLoadingEdit(true);

            if (!editName.trim()) {
                alert("يرجى إدخال الاسم");
                return;
            }

            // Updates the employee record and the login profile name together
            await rpc("update_employee_name", { p_employee: employee.id, p_name: editName.trim() });

            await refresh();

            alert("تم تحديث بيانات الموظف");

            setOpenEditModal(false);

        } catch (e) {
            console.error(e);
            alert("فشل التحديث");
        } finally {
            setLoadingEdit(false);
        }
    };

    //Delete employee (locks the login account too)
    const handleDeleteEmployee = async (employee) => {
        if (deletingEmployee) return;

        const confirmDelete = confirm("هل أنت متأكد من حذف حساب الموظف");
        if (!confirmDelete) return;

        try {
            setDeletingEmployee(true);

            await rpc("set_staff_deleted", { p_kind: "employee", p_id: employee.id, p_deleted: true });

            await refresh();

            alert("تم حذف حساب الموظف بنجاح");

            router.push("/");

        } catch (e) {
            console.error(e);
            alert("فشل حذف الحساب");
        } finally {
            setDeletingEmployee(false);
        }
    };

    if (loading || !employee) {
        return (
            <div className="loader">
                <ClipLoader />
            </div>
        );
    }

    return (
        <div className="student-details-container">
            <Modal
                title="بيانات دخول الموظف"
                open={!!credentials}
                onCancel={() => setCredentials(null)}
                footer={null}
                centered
            >
                <div style={{ textAlign: "center", direction: "ltr" }}>
                    <p>رقم الدخول: <strong>{credentials?.username}</strong></p>
                    <p>كلمة المرور: <strong>{credentials?.password}</strong></p>
                    <p style={{ color: "gray", fontSize: 13, direction: "rtl" }}>احفظ كلمة المرور الآن، لا يمكن عرضها مرة أخرى.</p>
                </div>
            </Modal>

            {/* HEADER */}
            <div className="card student-header">
                <PhotoUpload
                    bucket="employee-photos"
                    table="employees"
                    schoolId={employee.school_id}
                    recordId={employee.id}
                    photoPath={employee.photo_path}
                    photoUrl={employee.photo_url}
                    fallback={
                        <div className="student-avatar">
                            <FaUser size={30} />
                        </div>
                    }
                />

                <div className="student-details-info">
                    <h3>{employee.name}</h3>
                    <p className="sub-text">{employee.job_title}</p>
                </div>
            </div>

            {/* BASIC INFO */}
            <div className="card">
                <div className="card-header">
                    <h3>معلومات الموظف</h3>
                </div>

                <div className="card-content details-grid">
                    <Detail label="الاسم" value={employee.name} />
                    <Detail label="رقم الهاتف" value={employee.username} />
                    <Detail label="كلمة المرور" value={<button className="create-btn" style={{ height: 26, padding: "0 10px" }} disabled={resetting} onClick={handleResetPassword}>كلمة مرور جديدة</button>} />
                </div>
            </div>

            {/* ACTIONS */}
            <div className="student-details-delete-btn-box">
                <button
                    className="student-details-delete-btn"
                    style={{ backgroundColor: "#ef4444" }}
                    onClick={() => handleDeleteEmployee(employee)}
                >
                    {deletingEmployee ? (
                        <ClipLoader size={15} color="#fff" />
                    ) : (
                        "حذف الحساب"
                    )}
                </button>

                <button
                    className="student-details-delete-btn"
                    style={{ backgroundColor: "#008CBA" }}
                    onClick={openEditTeacher}
                >
                     تعديل البيانات
                </button>
            </div>
            <Modal
                title="تعديل بيانات الموظف"
                open={openEditModal}
                onCancel={() => setOpenEditModal(false)}
                footer={null}
                centered
            >
                <div className="create-school-form">
                    <input
                        placeholder="الاسم"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                    />

                    {/* SUBMIT */}
                    {loadingEdit ? (
                        <div className="btn-loading">
                            <ClipLoader size={15} color="#fff" />
                        </div>
                    ) : (
                        <button className="create-submit" onClick={handleUpdateEmployee}>
                         حفظ التعديلات
                        </button>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default EmployeeDetails;

const Detail = ({ label, value }) => {
    return (
        <div className="detail-item">
            <span className="label">{label}</span>
            <span className="value">{value || "-"}</span>
        </div>
    );
};