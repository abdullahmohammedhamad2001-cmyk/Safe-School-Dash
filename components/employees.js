"use client";

import React, { useMemo, useState } from "react";
import {collection,addDoc,setDoc,doc,Timestamp,getDoc} from "firebase/firestore";
import { DB } from "../firebaseConfig";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { Modal } from "antd";
import "../app/style.css";

// 🔥 Job priority
const EMPLOYEE_JOB_PRIORITY = {
  "المشرف العام": 1,
  "المدير": 2,
  "مدير الحسابات": 3,
  "محاسب": 4,
  "موظف معاون": 5,
};

const Employees = () => {
  const { employees, loading } = useGlobalState();

  const router = useRouter();

  const country = localStorage.getItem("schoolCountry") || "iraq";

  const [nameFilter, setNameFilter] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeePhoneNumber, setEmployeePhoneNumber] = useState("");
  const [employeeJobTitle,setEmployeeJobTitle] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [openDeletedEmployeesModal, setOpenDeletedEmployeesModal] = useState(false);
  const [selectedRestoreEmployee, setSelectedRestoreEmployee] = useState(null);
  const [loadingRestoreEmployee, setLoadingRestoreEmployee] = useState(false);

  // ✅ Filter + Sort
  const processedEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (emp.account_deleted) return false;
      if (nameFilter && !emp.name?.includes(nameFilter)) return false;
      return true;
    })
    .sort((a, b) => {
      const priorityA = EMPLOYEE_JOB_PRIORITY[a.job_title] ?? 999;
      const priorityB = EMPLOYEE_JOB_PRIORITY[b.job_title] ?? 999;

      return priorityA - priorityB; // smaller = higher rank
    });
  }, [employees, nameFilter]);

  //Deleted employees list
  const deletedEmployees = useMemo(() => {
    return employees.filter((e) => e.account_deleted);
  }, [employees]);
  
  //Open create new employee modal
  const openCreateModal = () => setOpenModal(true);

  //Close create new employee modal
  const closeCreateModal = () => {
    setOpenModal(false);
    setEmployeeName("");
    setEmployeePhoneNumber("");
    setEmployeeJobTitle("")
  };

  //Job titles
  const JOB_TITLES = [
    "المدير",
    "موظف معاون",
    "مدير الحسابات",
    "محاسب"
  ]

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

  //Create new employee doc
  const handleCreateEmployee = async () => {
    try {
      setLoadingCreate(true);

      //Validate inputs
      if (!employeeName || !employeePhoneNumber || !employeeJobTitle) {
        alert("يرجى إدخال جميع البيانات");
        return;
      }

      const phoneError = validatePhoneNumber(employeePhoneNumber, country);
      if (phoneError) {
        alert(phoneError);
        return;
      }

      //Prevent duplicate
      const existingSnap = await getDoc(
        doc(DB, "schoolAdmins", employeePhoneNumber.trim())
      );

      if (existingSnap.exists()) {
        alert("رقم الهاتف مستخدم بالفعل");
        return;
      }

      // 🔹 Get school data
      const schoolId = localStorage.getItem("adminSchoolID");
      const schoolName = localStorage.getItem("adminSchoolName");
      const logo = localStorage.getItem("schoolLogo");

      if (!schoolId || !schoolName) {
        alert("لم يتم العثور على بيانات المدرسة");
        return;
      }

      // 🔥 Generate password
      const tempPassword = Math.random().toString(36).slice(-8);

      // 🔥 Create employee doc
      const employeeRef = await addDoc(collection(DB, "employees"), {
        name: employeeName.trim(),
        phone_number: employeePhoneNumber.trim(),
        job_title: employeeJobTitle,
        school_id: schoolId,
        country: country,
        is_active: true,
        account_deleted: false,
        created_at: Timestamp.now(),
        username: employeePhoneNumber.trim(),
        password: tempPassword,
      });

      const employeeId = employeeRef.id;

      // 🔥 Create login account
      await setDoc(doc(DB, "schoolAdmins", employeePhoneNumber.trim()), {
        username: employeePhoneNumber.trim(),
        password: tempPassword,
        role: "admin",
        job_title: employeeJobTitle,
        name: employeeName.trim(),
        school: schoolName,
        school_id: schoolId,
        school_logo: logo,
        admin_id: employeeId,
        country: country,
        account_banned: false,
      });

      alert("تم إنشاء الموظف بنجاح");

      closeCreateModal();

    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء إنشاء الموظف");
    } finally {
      setLoadingCreate(false);
    }
  };

  //Restore employee
  const handleRestoreEmployee = async () => {
    try {
      if (!selectedRestoreEmployee) {
        alert("يرجى اختيار الموظف");
        return;
      }
  
      setLoadingRestoreEmployee(true);
  
      const employeeRef = doc(DB, "employees", selectedRestoreEmployee.id);
      const schoolAdminRef = doc(DB, "schoolAdmins", selectedRestoreEmployee.username);
  
      await runTransaction(DB, async (transaction) => {
  
        // ✅ Restore employee
        transaction.update(employeeRef, {
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
  
      alert("تم استرجاع حساب الموظف بنجاح");
  
      setSelectedRestoreEmployee(null);
      setOpenDeletedEmployeesModal(false);
  
    } catch (e) {
      console.error(e);
      alert("فشل استرجاع الحساب");
    } finally {
      setLoadingRestoreEmployee(false);
    }
  };

  return (
    <div className="students-container">
      <div className="students-header">
        <h2>الموظفين</h2>
        <div style={{ display: "flex",flexDirection:'row-reverse', gap: 10 }}>
          <div className="create-btn" onClick={openCreateModal}>
            <p>+ إنشاء حساب موظف</p>
          </div>
          <div
            className="create-btn"
            style={{ background: "#64748b" }}
            onClick={() => setOpenDeletedEmployeesModal(true)}
          >
            <p>الموظفين المحذوفين</p>
          </div>
        </div>
      </div>

      <Modal
        title="إنشاء حساب موظف"
        open={openModal}
        onCancel={closeCreateModal}
        footer={null}
        centered
      >
        <div className="create-school-form">
          <input
            placeholder="الاسم الكامل"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
          />

          <input
            placeholder="رقم الهاتف"
            value={employeePhoneNumber}
            onChange={(e) => setEmployeePhoneNumber(e.target.value)}
          />

          <select
            value={employeeJobTitle}
            onChange={(e) => setEmployeeJobTitle(e.target.value)}
          >
            <option value="">اختر الوظيفة</option>
            {JOB_TITLES.map((job) => (
              <option key={job} value={job}>
                {job}
              </option>
            ))}
          </select>
      
          {loadingCreate ? (
            <div className="btn-loading">
              <ClipLoader size={15} color="#fff" />
            </div>
          ) : (
            <button className="create-submit" onClick={handleCreateEmployee}>
             إنشاء
            </button>
          )}
      
        </div>
      </Modal>

      <Modal
        title="الموظفين المحذوفين"
        open={openDeletedEmployeesModal}
        onCancel={() => {
          setOpenDeletedEmployeesModal(false);
          setSelectedRestoreEmployee(null);
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
      
          {deletedEmployees.length === 0 ? (
            <div className="empty">لا يوجد مدرسين محذوفين</div>
          ) : (
            deletedEmployees.map((employee) => (
              <div
                key={employee.id}
                className={`deleted-students-table-row ${
                  selectedRestoreEmployee?.id === employee.id ? "active" : ""
                }`}
              >
                <span>{employee.name}</span>
                <span>{employee.username}</span>
                <span>
                  <button
                    className="create-submit"
                    onClick={() => {
                      setSelectedRestoreEmployee(employee);
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
        {selectedRestoreEmployee && (
          <div className="restore-students-select-students">
            <button
              className="create-submit"
              style={{marginTop:'10px'}}
              onClick={handleRestoreEmployee}
            >
              {loadingRestoreEmployee ? (
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
        <div className="employee-table-header">
          <span>الاسم</span>
          <span>رقم الهاتف</span>
          <span>المسمى الوظيفي</span>
        </div>

        {loading ? (
          <div className="loader">
            <ClipLoader size={30} color="#8a6115" />
          </div>
        ) : processedEmployees.length === 0 ? (
          <div className="empty">لا يوجد موظفين</div>
        ) : (
          processedEmployees.map((emp) => (
            <div 
              key={emp.id} 
              className="employee-table-row"
              style={{cursor:'pointer'}}
              onClick={() => router.push(`/employees/${emp.id}`)}
            >
              <span>{emp.name}</span>

              <span className="phone-number">
                {emp.phone_number || "-"}
              </span>

              <span>
                <div className="job-badge">
                  {emp.job_title || "-"}
                </div>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Employees;