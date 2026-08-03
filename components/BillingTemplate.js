"use client";

import React, { useEffect, useState } from "react";
import {collection,getDocs,addDoc,updateDoc,doc,query,where,Timestamp} from "firebase/firestore";
import { DB } from "../firebaseConfig";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { FiEdit2 } from "react-icons/fi";
import "../app/style.css";


const GRADES = [
  "أول ابتدائي",
  "ثاني ابتدائي",
  "ثالث ابتدائي",
  "رابع ابتدائي",
  "خامس ابتدائي",
  "سادس ابتدائي",
];

const EDUCATION_LEVELS = {
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

const BillingTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [step, setStep] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const currentYear = new Date().getFullYear();
  const academicYears = [
    `${currentYear - 1}-${currentYear}`,
    `${currentYear}-${currentYear + 1}`,
  ];

  const [selectedYear, setSelectedYear] = useState(academicYears[0]);
  const [academicYear, setAcademicYear] = useState(academicYears[0]);
  const [quantity, setQuantity] = useState(1);
  const [dueDates, setDueDates] = useState([]);
  const [gradeAmounts, setGradeAmounts] = useState({});
  const [saving, setSaving] = useState(false);

  const [expandedLevels, setExpandedLevels] = useState({
   ابتدائي: true,
   متوسط: false,
   إعدادي: false,
  });

  const [reviewExpandedLevels, setReviewExpandedLevels] = useState({
   ابتدائي: true,
   متوسط: false,
   إعدادي: false,
  });

  // INIT grades
  useEffect(() => {
    const init = {};
    GRADES.forEach((g) => (init[g] = ""));
    setGradeAmounts(init);
  }, []);

  // INIT dueDates
  useEffect(() => {
    setDueDates(
      Array.from({ length: quantity }, () => "")
    );
  }, [quantity]);

  // FETCH templates
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);

      const schoolId = localStorage.getItem("adminSchoolID");

      const snap = await getDocs(
        query(collection(DB, "billing_templates"), 
        where("school_id", "==", schoolId))
      );

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setTemplates(list);

    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(
    (t) => t.academic_year === selectedYear
  );

  //Validate steps before create the template
  const validateStep = () => {
    if (step === 0) {
      const exists = templates.some(
        (t) => t.academic_year === academicYear
      );

      if (exists) {
        return "هذه السنة الدراسية لديها قالب بالفعل";
      }
    }

    if (step === 2) {
      const hasEmpty = dueDates.some((d) => !d);
      if (hasEmpty) {
        return "يرجى تحديد تاريخ كل قسط";
      }
    }

    if (step === 3) {
      const allGrades = Object.values(EDUCATION_LEVELS).flat();

      const hasInvalid = allGrades.some(
        (g) => !gradeAmounts[g] || Number(gradeAmounts[g]) <= 0
      );

      if (hasInvalid) {
        return "يرجى إدخال المبلغ لكل الصفوف";
      }
    }

    return null;
  };

  // CREATE TEMPLATE
  const handleCreateTemplate = async () => {
    try {
      setSaving(true);

      const exists = templates.some(
        (t) => t.academic_year === academicYear
      );

      if (exists) {
        alert("هذه السنة الدراسية لديها قالب بالفعل");
        return;
      }

      const hasEmptyDates = dueDates.some((d) => !d);
      if (hasEmptyDates) {
        alert("يرجى تحديد تاريخ كل قسط");
        return;
      }

      const allGrades = Object.values(EDUCATION_LEVELS).flat();

      const hasInvalid = allGrades.some(
        (g) => !gradeAmounts[g] || Number(gradeAmounts[g]) <= 0
      );

      if (hasInvalid) {
        alert("يرجى إدخال المبلغ لكل الصفوف");
        return;
      }

      const schoolId = localStorage.getItem("adminSchoolID");

      await addDoc(collection(DB, "billing_templates"), {
        school_id: schoolId,
        academic_year: academicYear,
        number_of_payments: quantity,
        grade_amounts: Object.fromEntries(
          Object.entries(gradeAmounts).map(([k, v]) => [k, Number(v)])
        ),
        installments: dueDates.map((d, i) => ({
          index: i + 1,
          due_date: Timestamp.fromDate(new Date(d)),
        })),
        is_active: true,
        created_at: Timestamp.now(),
      });

      alert("تم إنشاء القالب");

      closeCreateModal();
      fetchTemplates();

    } catch (e) {
      console.log(e);
      alert("فشل الإنشاء");
    } finally {
      setSaving(false);
    }
  };

  //Close create modal
  const closeCreateModal = () => {
    setEditingTemplate(null); 
    setStep(0);
    setQuantity(1);
    setDueDates([]);
    setGradeAmounts({})
    setOpenCreate(false);
  }

  //Editing template phase
  useEffect(() => {
    if (!editingTemplate) return;

    setAcademicYear(editingTemplate.academic_year);
    setQuantity(editingTemplate.number_of_payments);

    setDueDates(
      editingTemplate.installments.map(inst =>
        new Date(inst.due_date.seconds * 1000)
          .toISOString()
          .split("T")[0]
      )
    );

    setGradeAmounts(editingTemplate.grade_amounts);

  }, [editingTemplate]);

  //Handle quantity change
    const handleQuantityChange = (newQty) => {
      setQuantity(newQty);

      setDueDates(prev => {
        if (newQty > prev.length) {
          return [...prev, ...Array(newQty - prev.length).fill("")];
        } else {
          return prev.slice(0, newQty);
        }
      });
    };

    //Validate edit steps
    const validateEditStep = () => {
      if (step === 2) {
        const hasEmpty = dueDates.some((d) => !d);
        if (hasEmpty) {
          return "يرجى تحديد تاريخ كل قسط";
        }
      }

      if (step === 3) {
        const allGrades = Object.values(EDUCATION_LEVELS).flat();

        const hasInvalid = allGrades.some(
          (g) => !gradeAmounts[g] || Number(gradeAmounts[g]) <= 0
        );

        if (hasInvalid) {
          return "يرجى إدخال المبلغ لكل الصفوف";
        }
      }

      return null;
    };

    //Update template
    const handleUpdateTemplate = async () => {
      try {
        setSaving(true);

        const error = validateEditStep();
        if (error) {
          alert(error);
          return;
        }

        const ref = doc(DB, "billing_templates", editingTemplate.id);

        await updateDoc(ref, {
          number_of_payments: quantity,
          grade_amounts: Object.fromEntries(
            Object.entries(gradeAmounts).map(([k, v]) => [k, Number(v)])
          ),
          installments: dueDates.map((d, i) => ({
            index: i + 1,
            due_date: Timestamp.fromDate(new Date(d)),
          })),
          updated_at: Timestamp.now(),
        });

        alert("تم تحديث القالب");

        closeEditModal();
        fetchTemplates();

      } catch (e) {
        console.log(e);
        alert("فشل التحديث");
      } finally {
        setSaving(false);
      }
    };
  
  //Close edit modal
  const closeEditModal = () => {
    setEditingTemplate(null); 
    setStep(0);
    setQuantity(1);
    setDueDates([]);
    setGradeAmounts({})
    setOpenEdit(false);
  }

  const formatIQD = (value) => {
    return Number(value || 0).toLocaleString("ar-IQ") + " د.ع";
  };

  const parseNumber = (val) => {
    return Number(val.replace(/,/g, "").replace(/[^\d]/g, ""));
  };

  const handleAmountChange = (value, grade) => {
    const clean = parseNumber(value);

    setGradeAmounts({
      ...gradeAmounts,
      [grade]: clean,
    });
  };

  //BillingTemplate card
  const TemplateCard = ({ t }) => {
    const [expandedLevels, setExpandedLevels] = useState({});

    return (
      <div className="template-card-modern">
        <div className="template-card-header">
          <div className="template-card-header-first-box">
            <h4>{t.academic_year}</h4>
            <p className="template-card-sub">عدد الاقساط : {t.number_of_payments}</p>
          </div>
          <div
            className="edit-template-btn"
            onClick={() => {
              setEditingTemplate(t);
              setOpenEdit(true);
            }}
          >
            <p>تعديل</p>
            <FiEdit2 />
          </div>
        </div>

        {/* INSTALLMENTS */}
        <div className="template-installments">
          {t.installments?.map((inst) => (
            <div key={inst.index} className="installment-pill">
              <p>قسط {inst.index}</p>
              <p>-</p>
              <p>{new Date(inst.due_date.seconds * 1000).toLocaleDateString("ar-EG")}</p>
            </div>
          ))}
        </div>

        <div className="template-expanded">
          {/* LEVELS */}
          {Object.entries(EDUCATION_LEVELS).map(([level, grades]) => {
            const hasData = grades.some(
              g => t.grade_amounts?.[g] !== undefined
            );

            if (!hasData) return null;

            return (
              <div key={level} className="level-card-web">
                <div
                  className="level-header-web"
                  onClick={() =>
                    setExpandedLevels(prev => ({
                      ...prev,
                      [level]: !prev[level]
                    }))
                  }
                >
                  <p>المرحلة {level}</p>
                  <p>{expandedLevels[level] ? "−" : "+"}</p>
                </div>

                {/* BODY */}
                {expandedLevels[level] && (
                  <div className="level-content-web">
                    {grades.map((grade) => {
                      const total = t.grade_amounts?.[grade];
                      if (!total) return null;

                      const perInstallment = total / t.number_of_payments;

                      return (
                        <div key={grade} className="grade-card-web">
                          <div className="grade-card-header-web">
                            <p style={{fontSize:'14px'}}>{grade}</p>
                            <p className="total">
                              {Number(total).toLocaleString("ar-IQ")} د.ع
                            </p>
                          </div>

                          <div className="installment-row-web">
                            <p style={{fontSize:'13px'}}>مبلغ القسط</p>
                            <p className="per-installment">
                              {perInstallment.toLocaleString("ar-IQ")} د.ع
                            </p>
                          </div>

                        </div>
                      );
                    })}

                  </div>
                )}

              </div>
            );
          })}

        </div>
      </div>
    );
  };

  return (
    <div className="students-container">

      {/* HEADER */}
      <div className="students-header">
        <h2>الفواتير السنوية</h2>
        <div style={{ display: "flex",flexDirection:'row-reverse', gap: 10 }}>
          <div className="create-btn" onClick={() => setOpenCreate(true)}>
            <p>+ إضافة قالب</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="students-filters">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          {academicYears.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* LIST */}
      <div className="card" style={{border:'none'}}>
        <div className="card-content">
          {loading ? (
            <ClipLoader />
          ) : filteredTemplates.length === 0 ? (
            <div className="empty">لا يوجد فواتير</div>
          ) : (
            filteredTemplates.map((t) => (
              <TemplateCard key={t.id} t={t} />
            ))
          )}
        </div>
      </div>

      {/* MODALS */}
      <Modal 
        open={openCreate} 
        onCancel={closeCreateModal} 
        footer={null} 
        centered
      >
        <div className="template-modal">

          <div className="steps">
            {["السنة", "الأقساط", "التواريخ", "المبالغ", "مراجعة"].map((s, i) => (
              <div key={i} className={`step ${step === i ? "active" : ""}`}>
                {s}
              </div>
            ))}
          </div>

          <div className="template-modal-content">
            {step === 0 && (
              <div className="installement-step-box">
                <p>السنة الدراسية</p>
                <select
                  value={academicYear}
                  disabled={!!editingTemplate}
                  onChange={(e) => setAcademicYear(e.target.value)}
                >
                  {academicYears.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {step === 1 && (
              <div className="installement-step-box">
                <p>عدد الاقساط</p>
                <div className="qty-row">
                  <button className="qty-row-button qty-row-minus" onClick={() => setQuantity(q => Math.max(1, q - 1))}>-</button>
                  <p className="qty-row-label">{quantity}</p>
                  <button className="qty-row-button qty-row-plus" onClick={() => setQuantity(q => q + 1)}>+</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="installement-step-box due-dates-container">
                {
                  dueDates.map((d, i) => (
                    <div key={i} className="due-dates-box">
                      <p>قسط {i + 1}</p>
                      <input
                        type="date"
                        value={d}
                        onChange={(e) => {
                          const copy = [...dueDates];
                          copy[i] = e.target.value;
                          setDueDates(copy);
                        }}
                        className="due-dates-box-input"
                      />
                    </div>
                  ))
                }
              </div>
            )}

            {step === 3 && (
              <div className="amounts-container">
                {Object.entries(EDUCATION_LEVELS).map(([level, grades]) => (
                  <div key={level} className="level-card">
                    <div
                      className="level-header"
                      onClick={() =>
                        setExpandedLevels(prev => ({
                          ...prev,
                          [level]: !prev[level]
                        }))
                      }
                    >
                      <span>المرحلة {level}</span>
                      <span>{expandedLevels[level] ? "−" : "+"}</span>
                    </div>

                    {expandedLevels[level] && (
                      <div className="level-content">
                        {grades.map((grade) => (
                          <div key={grade} className="grade-card">
                            <div className="grade-card-header">
                              <span className="grade-card-header-grade">{grade}</span>
                              <span className="per-installment">
                                 القسط: {
                                    quantity > 0
                                      ? formatIQD(Number(gradeAmounts[grade] || 0) / quantity)
                                      : 0
                                  }
                              </span>
                            </div>
                            <div className="grade-card-content">
                              <input
                                type="number"
                                placeholder="المبلغ السنوي"
                                value={gradeAmounts[grade] || ""}
                                onChange={(e) => handleAmountChange(e.target.value, grade)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="review-container">
                <div className="review-section">
                  <h4>جدول الأقساط ({quantity})</h4>

                  {dueDates.map((d, i) => (
                    <div key={i} className="review-row">
                      <div className="review-row-index-circle">
                        <span className="review-row-index-circle-span">{i + 1}</span>
                      </div>
                      <div className="review-row-index-due-date">
                        <span className="review-row-index-due-date-span1">
                         القسط {i + 1}
                        </span>
                        <span className="review-row-index-due-date-span2">{d}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {Object.entries(EDUCATION_LEVELS).map(([level, grades]) => {
                  const hasData = grades.some(g => gradeAmounts[g]);
                  if (!hasData) return null;

                  return (
                    <div key={level} className="review-level-card">
                      <div
                        className="level-header"
                        onClick={() =>
                          setReviewExpandedLevels(prev => ({
                            ...prev,
                            [level]: !prev[level]
                          }))
                        }
                      >
                        <span>المرحلة {level}</span>
                        <span>{reviewExpandedLevels[level] ? "−" : "+"}</span>
                      </div>

                      {reviewExpandedLevels[level] && (
                        <div className="level-content">

                          {grades.map((grade) => {
                            const total = gradeAmounts[grade];
                            if (!total) return null;

                            return (
                              <div key={grade} className="review-grade-card">

                                <div className="review-grade-header">
                                  <span>{grade}</span>
                                  <span className="review-grade-header-total">{formatIQD(total)}</span>
                                </div>

                                <div className="installment-row">
                                  <span>مبلغ القسط</span>
                                  <span>
                                    {formatIQD(Number(total) / quantity)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-actions">
            {step > 0 && <button className='modal-actions-button outline-button' onClick={() => setStep(s => s - 1)}>رجوع</button>}

            {step < 4 ? (
              <button 
                className='modal-actions-button submit-button' 
                onClick={() => {
                  const error = validateStep();
                  if (error) {
                    alert(error);
                    return;
                  }

                  setStep(s => s + 1);
                }}
              >
                التالي
              </button>
            ) : (
              <button className='modal-actions-button submit-button' onClick={handleCreateTemplate}>
                {saving ? <ClipLoader color="#fff" size={15} /> : "إضافة"}
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal 
          open={openEdit} 
          onCancel={closeEditModal} 
          footer={null} 
          centered
        >
          <div className="template-modal">
            <div className="steps">
              {["السنة", "الأقساط", "التواريخ", "المبالغ", "مراجعة"].map((s, i) => (
                <div key={i} className={`step ${step === i ? "active" : ""}`}>
                  {s}
                </div>
              ))}
            </div>

          <div className="template-modal-content">
            {step === 0 && (
              <div className="installement-step-box">
                <p>السنة الدراسية</p>
                <select
                  value={academicYear}
                  disabled={!!editingTemplate}
                  onChange={(e) => setAcademicYear(e.target.value)}
                >
                  {academicYears.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {step === 1 && (
              <div className="installement-step-box">
                <p>عدد الاقساط</p>
                <div className="qty-row">
                  <button 
                    className="qty-row-button qty-row-minus" 
                    onClick={() => handleQuantityChange(Math.max(1, quantity - 1))}
                  >
                    -
                  </button>
                  <p className="qty-row-label">{quantity}</p>
                  <button 
                    className="qty-row-button qty-row-plus" 
                    onClick={() => handleQuantityChange(quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="installement-step-box due-dates-container">
                {
                  dueDates.map((d, i) => (
                    <div key={i} className="due-dates-box">
                      <p>قسط {i + 1}</p>
                      <input
                        type="date"
                        value={d}
                        onChange={(e) => {
                          const copy = [...dueDates];
                          copy[i] = e.target.value;
                          setDueDates(copy);
                        }}
                        className="due-dates-box-input"
                      />
                    </div>
                  ))
                }
              </div>
            )}

            {step === 3 && (
              <div className="amounts-container">
                {Object.entries(EDUCATION_LEVELS).map(([level, grades]) => (
                  <div key={level} className="level-card">
                    <div
                      className="level-header"
                      onClick={() =>
                        setExpandedLevels(prev => ({
                          ...prev,
                          [level]: !prev[level]
                        }))
                      }
                    >
                      <span>المرحلة {level}</span>
                      <span>{expandedLevels[level] ? "−" : "+"}</span>
                    </div>

                    {expandedLevels[level] && (
                      <div className="level-content">
                        {grades.map((grade) => (
                          <div key={grade} className="grade-card">
                            <div className="grade-card-header">
                              <span className="grade-card-header-grade">{grade}</span>
                              <span className="per-installment">
                                 القسط: {
                                    quantity > 0
                                      ? formatIQD(Number(gradeAmounts[grade] || 0) / quantity)
                                      : 0
                                  }
                              </span>
                            </div>
                            <div className="grade-card-content">
                              <input
                                type="number"
                                placeholder="المبلغ السنوي"
                                value={gradeAmounts[grade] || ""}
                                onChange={(e) => handleAmountChange(e.target.value, grade)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="review-container">
                <div className="review-section">
                  <h4>جدول الأقساط ({quantity})</h4>

                  {dueDates.map((d, i) => (
                    <div key={i} className="review-row">
                      <div className="review-row-index-circle">
                        <span className="review-row-index-circle-span">{i + 1}</span>
                      </div>
                      <div className="review-row-index-due-date">
                        <span className="review-row-index-due-date-span1">
                         القسط {i + 1}
                        </span>
                        <span className="review-row-index-due-date-span2">{d}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {Object.entries(EDUCATION_LEVELS).map(([level, grades]) => {
                  const hasData = grades.some(g => gradeAmounts[g]);
                  if (!hasData) return null;

                  return (
                    <div key={level} className="review-level-card">
                      <div
                        className="level-header"
                        onClick={() =>
                          setReviewExpandedLevels(prev => ({
                            ...prev,
                            [level]: !prev[level]
                          }))
                        }
                      >
                        <span>المرحلة {level}</span>
                        <span>{reviewExpandedLevels[level] ? "−" : "+"}</span>
                      </div>

                      {reviewExpandedLevels[level] && (
                        <div className="level-content">

                          {grades.map((grade) => {
                            const total = gradeAmounts[grade];
                            if (!total) return null;

                            return (
                              <div key={grade} className="review-grade-card">

                                <div className="review-grade-header">
                                  <span>{grade}</span>
                                  <span className="review-grade-header-total">{formatIQD(total)}</span>
                                </div>

                                <div className="installment-row">
                                  <span>مبلغ القسط</span>
                                  <span>
                                    {formatIQD(Number(total) / quantity)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-actions">
            {step > 0 && <button className='modal-actions-button outline-button' onClick={() => setStep(s => s - 1)}>رجوع</button>}

            {step < 4 ? (
              <button 
                className='modal-actions-button submit-button' 
                onClick={() => {
                  const error = validateEditStep();
                  if (error) {
                    alert(error);
                    return;
                  }

                  setStep(s => s + 1);
                }}
              >
                التالي
              </button>
            ) : (
              <button className='modal-actions-button submit-button' onClick={handleUpdateTemplate}>
                {saving ? <ClipLoader color="#fff" size={15} /> : "تعديل"}
              </button>
            )}
          </div>
        </div>
        </Modal>
     
    </div>
  );
};

export default BillingTemplatesPage;

/*
  //Edit existed template
  const handleEditTemplate = (t) => {
    setEditingTemplate(t);

    // Convert due dates
    const dates = t.installments.map(inst => {
      const d = new Date(inst.due_date.seconds * 1000);
      return d.toISOString().split("T")[0];
    });

    setQuantity(t.number_of_payments);
    setDueDates(dates);
    setAcademicYear(t.academic_year);
    setGradeAmounts(t.grade_amounts);

    setStep(0);
    setOpenEdit(true);
  };
*/