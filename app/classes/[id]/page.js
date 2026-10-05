"use client";

import React, { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {useGlobalState} from '../../../globalState';
import { supabase, rpc } from "../../../supabaseClient";
import {sortClasses} from '../../../lib/sortClasses'
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { FiEdit2 } from "react-icons/fi";
import { FaRegTrashCan} from "react-icons/fa6";
import { FaExchangeAlt } from "react-icons/fa";
import "../../style.css";

const getTeacherName = (teachers, id) => {
    return teachers.find(t => t.id === id)?.name || "-";
};

//Format time
const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const TimetableSection = ({ classData, teachers,students }) => {
    const { refresh } = useGlobalState();

    const [openAddModal, setOpenAddModal] = useState(false);
    const [openEditModal, setOpenEditModal] = useState(false);
    const [selectedDayIndex, setSelectedDayIndex] = useState(null);
    const [editingSession, setEditingSession] = useState(null);
    const [newSession, setNewSession] = useState({
        subject: "",
        teacher_id: "",
        start: "",
        end: "",
    });
    const [savingNewSession,setSavingNewSession] = useState(false);
    const [savingEditedSession,setSavingEditedSession] = useState(false);
    const [deletingSession, setDeletingSession] = useState(null);

    //Subjects
    const SUBJECTS = [
        "اللغة العربية",
        "اللغة الإنجليزية",
        "الرياضيات",
        "العلوم",
        "الفيزياء",
        "الكيمياء",
        "الأحياء",
        "التاريخ",
        "الجغرافية",
        "التربية الإسلامية",
        "التربية الوطنية",
        "التربية الفنية",
        "التربية الرياضية",
        "الحاسوب",
        "الاقتصاد",
        "علم الاجتماع",
        "الفلسفة",
        "المنطق",
        "اللغة الفرنسية",
    ];

    //Get teacher by subject
    const getTeachersBySubject = (subjectName) => {
        return teachers.filter((teacher) => {
            if (!teacher.subjects) return false;

            return Object.values(teacher.subjects).some(
                (subj) => subj.name === subjectName
            );
        });
    };

    //Open add session modal
    const openAdd = () => {
        setSelectedDayIndex(null);

        setNewSession({
            subject: "",
            teacher_id: "",
            start: "",
            end: "",
        });

        setOpenAddModal(true);
    };

    //Convert a clock time to the ISO string stored in the timetable
    const toTimestamp = (timeStr) => {
        const [h, m] = timeStr.split(":");

        return new Date(2000, 0, 1, Number(h), Number(m)).toISOString();
    };

    //Check is subject exist
    const doesSubjectExist = (timetable, subject) => {
        return timetable.some(day =>
            day.sessions.some(s => s.subject === subject)
        );
    };

    //Save new session
    const handleAddSession = async () => {
        try {
            setSavingNewSession(true);

            if (selectedDayIndex === null || selectedDayIndex === "") {
                alert("يرجى اختيار اليوم");
                return;
            }

            if (!newSession.subject || !newSession.teacher_id) {
                alert("يرجى إدخال جميع البيانات");
                return;
            }

            if (!newSession.start || !newSession.end) {
                alert("يرجى تحديد الوقت");
                return;
            }

            const dayIndex = selectedDayIndex;
            const day = classData.timetable[dayIndex];

            const subjectExists = doesSubjectExist(
                classData.timetable,
                newSession.subject
            );

            const session = {
                subject: newSession.subject,
                teacher_id: newSession.teacher_id,
                start: toTimestamp(newSession.start),
                end: toTimestamp(newSession.end),
            };

            const updatedTimetable = [...classData.timetable];

            updatedTimetable[dayIndex] = {
                ...day,
                active: true,
                sessions: [...day.sessions, session],
            };

            // sort by time
            updatedTimetable[dayIndex].sessions.sort(
                (a, b) => new Date(a.start) - new Date(b.start)
            );

            //SAVE CLASS
            const { error } = await supabase
                .from("classes")
                .update({ timetable: updatedTimetable })
                .eq("id", classData.id);

            if (error) throw error;

            // Links the teacher's subject to this class and opens the subject chat on its first session
            await rpc("class_session_added", {
                p_class: classData.id,
                p_subject: newSession.subject,
                p_teacher: newSession.teacher_id,
                p_first_for_subject: !subjectExists,
            });

            await refresh();

            alert("تمت إضافة الحصة");

            setOpenAddModal(false);

        } catch (e) {
            console.error(e);
            alert("فشل إضافة الحصة");
        } finally {
            setSavingNewSession(false)
        }
    };

    //Time input helper
    const formatInputTime = (timestamp) => {
        if (!timestamp) return "";

        const d = new Date(timestamp);
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");

        return `${h}:${m}`;
    };

    //Edit existed session
    const openEdit = (dayIndex, sessionIndex, session) => {
        setEditingSession({dayIndex,sessionIndex,});

        setSelectedDayIndex(dayIndex);

        setNewSession({
            subject: session.subject,
            teacher_id: session.teacher_id,
            start: formatInputTime(session.start),
            end: formatInputTime(session.end),
        });

        setOpenEditModal(true);
    };

    //Save edited session
    const handleEditSession = async () => {
        try {
            setSavingEditedSession(true);
            const { dayIndex, sessionIndex } = editingSession;

            const updatedTimetable = [...classData.timetable];

            updatedTimetable[dayIndex].sessions[sessionIndex] = {
                subject: newSession.subject,
                teacher_id: newSession.teacher_id,
                start: toTimestamp(newSession.start),
                end: toTimestamp(newSession.end),
            };

            //ALWAYS SORT
            updatedTimetable[dayIndex].sessions.sort(
                (a, b) => new Date(a.start) - new Date(b.start)
            );

            const { error } = await supabase
                .from("classes")
                .update({ timetable: updatedTimetable })
                .eq("id", classData.id);

            if (error) throw error;

            await refresh();

            alert("تم التعديل بنجاح");

            setOpenEditModal(false);
            setEditingSession(null);

        } catch (e) {
            console.error(e);
            alert("فشل التعديل");
        } finally {
            setSavingEditedSession(false);
        }
    };

    // Count how many times a subject exists in timetable
    const countSubjectOccurrences = (timetable, subject) => {
        let count = 0;

        timetable.forEach(day => {
            day.sessions.forEach(s => {
                if (s.subject === subject) count++;
            });
        });

        return count;
    };

    // Count teacher sessions for this subject in this class
    const countTeacherSubjectOccurrences = (timetable, teacherId, subject) => {
        let count = 0;

        timetable.forEach(day => {
            day.sessions.forEach(s => {
                if (s.teacher_id === teacherId && s.subject === subject) {
                    count++;
                }
            });
        });

        return count;
    };

    //Delete session
    const handleDeleteSession = async (dayIndex, sessionIndex) => {
        try {
            if (!confirm("هل أنت متأكد من حذف الحصة؟")) return;

            setDeletingSession({ dayIndex, sessionIndex });

            const sessionToDelete = classData.timetable[dayIndex].sessions[sessionIndex];

            const subject = sessionToDelete.subject;
            const teacherId = sessionToDelete.teacher_id;

            //BEFORE deletion counts
            const subjectCountBefore = countSubjectOccurrences(
                classData.timetable,
                subject
            );

            const teacherSubjectCountBefore = countTeacherSubjectOccurrences(
                classData.timetable,
                teacherId,
                subject
            );

            // 🔥 REMOVE SESSION
            const updatedTimetable = [...classData.timetable];

            updatedTimetable[dayIndex] = {
                ...updatedTimetable[dayIndex],
                sessions: updatedTimetable[dayIndex].sessions.filter(
                    (_, i) => i !== sessionIndex
                ),
            };

            // If day empty → deactivate
            if (updatedTimetable[dayIndex].sessions.length === 0) {
                updatedTimetable[dayIndex].active = false;
            }

            // SAVE CLASS
            const { error } = await supabase
                .from("classes")
                .update({ timetable: updatedTimetable })
                .eq("id", classData.id);

            if (error) throw error;

            // Archive the subject chat after its last session and unlink the teacher after theirs
            await rpc("class_session_removed", {
                p_class: classData.id,
                p_subject: subject,
                p_teacher: teacherId,
                p_last_for_subject: subjectCountBefore === 1,
                p_last_for_teacher: teacherSubjectCountBefore === 1,
            });

            await refresh();

            alert("تم حذف الحصة");

        } catch (e) {
            console.error(e);
            alert("فشل حذف الحصة");
        } finally {
            setDeletingSession(null)
        }
    };

    return (
        <div className="card">
            <div className="card-header timetable-header">
                <h4>الجدول الدراسي</h4>

                <button className="create-btn" onClick={openAdd}>
                    <p>+ إضافة حصة</p>
                </button>
            </div>

            <Modal
                open={openAddModal}
                onCancel={() => setOpenAddModal(false)}
                footer={null}
                centered
            >
                <div className="create-school-form">
                    <h3>إضافة حصة</h3>

                    <select
                        value={selectedDayIndex ?? ""}
                        onChange={(e) => setSelectedDayIndex(Number(e.target.value))}
                    >
                        <option value="">اختر اليوم</option>
                        {classData.timetable.map((day) => (
                            <option key={day.dayIndex} value={day.dayIndex}>
                                {day.day}
                            </option>
                        ))}
                    </select>

                    <select
                        value={newSession.subject}
                        onChange={(e) =>
                            setNewSession({
                                ...newSession,
                                subject: e.target.value,
                                teacher_id: "",
                            })
                        }
                    >
                        <option value="">اختر المادة</option>
                        {SUBJECTS.map((s) => (
                            <option key={s}>{s}</option>
                        ))}
                    </select>

                    {newSession.subject && (
                        <select
                            value={newSession.teacher_id}
                            onChange={(e) =>
                                setNewSession({ ...newSession, teacher_id: e.target.value })
                            }
                        >
                            <option value="">اختر المعلم</option>
                            {getTeachersBySubject(newSession.subject).map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    )}

                    <div className="time-row">
                        <input
                            type="time"
                            value={newSession.start}
                            onChange={(e) =>
                                setNewSession({ ...newSession, start: e.target.value })
                            }
                        />
                        <input
                            type="time"
                            value={newSession.end}
                            onChange={(e) =>
                                setNewSession({ ...newSession, end: e.target.value })
                            }
                        />
                    </div>

                    {savingNewSession ? (
                        <div className="btn-loading">
                            <ClipLoader size={15} color="#fff" />
                        </div>
                    ) : (
                        <button className="create-submit" onClick={handleAddSession}>
                             حفظ
                        </button>
                    )}

                </div>
            </Modal>

            <div className="card-content">
                {classData.timetable.every(d => d.sessions.length === 0) ? (
                    <div className="empty">لا توجد حصص</div>
                ) : (
                    classData.timetable.map((day) => (
                        <div key={day.dayIndex} className="day-section">
                            <h4 className="day-title">{day.day}</h4>

                            {day.sessions.length === 0 ? (
                                <div className="empty">لا توجد حصص</div>
                            ) : (
                                <div className="table">
                                    <div className="timetable-table-head">
                                        <span>المادة</span>
                                        <span>المعلم</span>
                                        <span>من</span>
                                        <span>إلى</span>
                                        <span>إجراءات</span>
                                    </div>

                                    {day.sessions.map((s, i) => (
                                        <div key={i} className="timetable-table-row">
                                            <span>{s.subject}</span>
                                            <span>{getTeacherName(teachers, s.teacher_id)}</span>
                                            <span>{formatTime(s.start)}</span>
                                            <span>{formatTime(s.end)}</span>
                                            <span className="actions">
                                                <button onClick={() => openEdit(day.dayIndex, i, s)}>
                                                    <FiEdit2 fontSize={16}/>
                                                </button>
 
                                                <button 
                                                    disabled={deletingSession !== null}
                                                    onClick={() => handleDeleteSession(day.dayIndex, i)}
                                                >
                                                    {deletingSession &&
                                                    deletingSession.dayIndex === day.dayIndex &&
                                                    deletingSession.sessionIndex === i ? (
                                                        <ClipLoader size={15} color="red" />
                                                    ) : (
                                                        <FaRegTrashCan fontSize={16} color="red" />
                                                    )}
                                                    
                                                </button>                               
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <Modal
                                open={openEditModal}
                                onCancel={() => setOpenEditModal(false)}
                                footer={null}
                                centered
                            >
                                <div className="create-school-form">
                                    <h3>تعديل الحصة</h3>

                                    <input
                                        value={classData.timetable[selectedDayIndex]?.day}
                                        disabled
                                    />

                                    <input value={newSession.subject} disabled />

                                    <input
                                        value={getTeacherName(teachers, newSession.teacher_id)}
                                        disabled
                                    />

                                    <div className="time-row">
                                        <input
                                            type="time"
                                            value={newSession.start}
                                            onChange={(e) =>
                                                setNewSession({ ...newSession, start: e.target.value })
                                            }
                                        />
                                        <input
                                            type="time"
                                            value={newSession.end}
                                            onChange={(e) =>
                                                setNewSession({ ...newSession, end: e.target.value })
                                            }
                                        />
                                    </div>

                                    {savingEditedSession ? (
                                        <div className="btn-loading">
                                            <ClipLoader size={15} color="#fff" />
                                        </div>
                                    ) : (
                                        <button className="create-submit" onClick={handleEditSession}>
                                             حفظ التعديل
                                        </button>
                                    )}
                                </div>
                            </Modal>
                        </div>
                    ))
                )}

            </div>
        </div>
    );
};

const ClassDetails = () => {
    const { id } = useParams();
    const { classes, students, teachers, loading, refresh } = useGlobalState();

    const [openMoveModal, setOpenMoveModal] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [targetClassId, setTargetClassId] = useState("");
    const [targetClassName, setTargetClassName] = useState("");
    const [targetClassGrade, setTargetClassGrade] = useState("");
    const [switchLoading, setSwitchLoading] = useState(false);

    const currentClass = classes.find(c => c.id === id);

    const classStudents = useMemo(() => {
        return students.filter((s) => s.class_id === id && !s.account_deleted);
    }, [students, id]);

    const schoolClasses = useMemo(() => {
        return sortClasses(classes.filter(c => c.schoolId === currentClass.schoolId));
    }, [classes, currentClass]);

    //Handle move student
    const handleMoveStudent = async () => {
        try {
            if (!targetClassId) {
                alert("يرجى اختيار الصف الجديد");
                return;
            }

            if (targetClassId === currentClass.id) {
                alert("الطالب موجود بالفعل في هذا الصف");
                return;
            }

            setSwitchLoading(true);

            // Moves the student and swaps the class chats in one database transaction
            await rpc("move_student_to_class", {
                p_student: selectedStudent.id,
                p_class: targetClassId,
            });

            await refresh();

            alert("تم نقل الطالب بنجاح");

            setOpenMoveModal(false);
            setTargetClassId("");
            setTargetClassName("");
            setTargetClassGrade("");

        } catch (e) {
            console.error(e);
            alert("فشل نقل الطالب");
        } finally {
            setSwitchLoading(false);
        }
    };

    if (loading || !currentClass) {
        return <div className="loader"><ClipLoader /></div>;
    }

    return (
        <div className="class-details-container">
            <div className="class-header">
                <h2>{currentClass.name}</h2>
            </div>

            <div className="card">
                <div className="card-header">                    
                    <h4>الطلاب ({classStudents.length})</h4>
                </div>

                <div className="card-content">
                    <div className="table">
                        <div className="class-details-students-table-head">
                            <span>الاسم</span>
                            <span>الهاتف</span>
                            <span>إجراءات</span>
                        </div>

                        {classStudents.length === 0 ? (
                            <div className="empty">لا يوجد طلاب</div>
                        ) : (
                            classStudents.map((s) => (
                                <div key={s.id} className="class-details-students-table-row">
                                    <span>{s.name} {s.parent_name}</span>
                                    <span className="phone-number">{s.phone_number}</span>
                                    <span className="actions">
                                        <button
                                            onClick={() => {
                                                setSelectedStudent(s);
                                                setOpenMoveModal(true);
                                            }}
                                        >
                                            <FaExchangeAlt fontSize={16}/>
                                        </button>                              
                                    </span>
                                </div>
                            ))
                        )}

                        <Modal
                            open={openMoveModal}
                            onCancel={() => setOpenMoveModal(false)}
                            footer={null}
                            centered
                        >
                            <div className="create-school-form">
                                <h3>نقل الطالب</h3>

                                <div className="switch-box">
                                    <p>الطالب</p>
                                    <strong>{selectedStudent?.name} {selectedStudent?.parent_name}</strong>
                                </div>

                                <div className="switch-box">
                                    <p>الصف الحالي</p>
                                    <strong>{currentClass.name}</strong>
                                </div>

                                <select
                                    value={targetClassId}
                                    onChange={(e) => {
                                        const cls = schoolClasses.find(c => c.id === e.target.value);
                                        setTargetClassId(cls.id);
                                        setTargetClassName(cls.name);
                                        setTargetClassGrade(cls.grade);
                                    }}
                                >
                                    <option value="">اختر الصف الجديد</option>

                                    {schoolClasses
                                        .filter(c => c.id !== currentClass.id)
                                        .map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                </select>

                                {switchLoading ? (
                                    <div className="btn-loading">
                                        <ClipLoader size={15} color="#fff" />
                                    </div>
                                ) : (
                                    <button className="create-submit" onClick={handleMoveStudent}>
                                         نقل
                                    </button>
                                )}

                            </div>
                        </Modal>
                    </div>
                </div>
            </div>

            {/* TIMETABLE */}
            <TimetableSection
                classData={currentClass}
                teachers={teachers}
                students={classStudents}
            />

        </div>
    );
};

export default ClassDetails;