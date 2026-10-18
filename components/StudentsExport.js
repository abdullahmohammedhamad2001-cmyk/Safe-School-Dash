"use client";

import React, { useMemo, useState } from "react";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { useGlobalState } from "../globalState";
import { sortClasses } from "../lib/sortClasses";
import { exportStudentsExcel, exportStudentsPdf } from "../lib/studentsExport";

const StudentsExport = ({ open, onClose }) => {
  const { students, classes } = useGlobalState();

  const [classId, setClassId] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [format, setFormat] = useState("xlsx");
  const [exporting, setExporting] = useState(false);

  const sortedClasses = useMemo(() => sortClasses(classes), [classes]);

  const rows = useMemo(() => {
    const order = new Map(sortedClasses.map((c, i) => [c.id, i]));

    return students
      .filter((s) => !s.account_deleted)
      .filter((s) => classId === "all" || s.class_id === classId)
      .filter((s) => linkFilter === "all" || !s.linked_parent)
      .sort((a, b) =>
        (order.get(a.class_id) ?? 999) - (order.get(b.class_id) ?? 999) || (a.name || "").localeCompare(b.name || "", "ar")
      )
      .map((s) => ({ name: s.name || "", parent_name: s.parent_name || "", class_name: s.class_name || "", phone: s.phone_number || "", code: s.id }));
  }, [students, sortedClasses, classId, linkFilter]);

  const handleExport = async () => {
    if (!rows.length) {
      alert("لا يوجد طلاب بهذه الخيارات");
      return;
    }

    const className = classId === "all" ? "كل الصفوف" : sortedClasses.find((c) => c.id === classId)?.name || "";
    const title = `قائمة الطلاب - ${className}${linkFilter === "unlinked" ? " (غير المرتبطين)" : ""}`;
    const fileName = `الطلاب-${className}`;
    const schoolName = localStorage.getItem("adminSchoolName") || "";

    try {
      setExporting(true);
      if (format === "pdf") await exportStudentsPdf(rows, { title, schoolName, fileName });
      else await exportStudentsExcel(rows, { title, fileName });
    } catch (e) {
      console.error("Export students failed:", e);
      alert("فشل تصدير الملف");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title="تصدير بيانات الطلاب" open={open} onCancel={onClose} footer={null} centered>
      <div className="create-school-form">
        <div className="input-group">
          <label>الصف والشعبة</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="all">كل الصفوف</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label>الطلاب</label>
          <select value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)}>
            <option value="all">كل الطلاب</option>
            <option value="unlinked">غير المرتبطين بولي أمر فقط</option>
          </select>
        </div>

        <div className="input-group">
          <label>نوع الملف</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          عدد الطلاب في التصدير: {rows.length}
        </p>

        {exporting ? (
          <div className="btn-loading">
            <ClipLoader size={15} color="#fff" />
          </div>
        ) : (
          <button className="create-submit" onClick={handleExport} disabled={!rows.length}>
            تصدير
          </button>
        )}
      </div>
    </Modal>
  );
};

export default StudentsExport;
