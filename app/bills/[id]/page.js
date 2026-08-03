"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {collection,getDocs,getDoc,query,where,doc,updateDoc,runTransaction,Timestamp} from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import html2pdf from "html2pdf.js";
import { Modal } from "antd";
import ClipLoader from "react-spinners/ClipLoader";
import { FaRegPlusSquare } from "react-icons/fa";
import { FaRegSquareMinus } from "react-icons/fa6";
import "../../style.css";

const BillingDetails = () => {
    const { id } = useParams();

    const [loading, setLoading] = useState(true);
    const [student, setStudent] = useState(null);
    const [bills, setBills] = useState([]);
    const [payingId, setPayingId] = useState(null);
    const [openPaymentModal, setOpenPaymentModal] = useState(false);
    const [selectedBill, setSelectedBill] = useState(null);
    const [paymentType, setPaymentType] = useState("total");
    const [paymentValue, setPaymentValue] = useState("");
    const [downloadingId, setDownloadingId] = useState(null);
    const [openDiscountModal, setOpenDiscountModal] = useState(false);
    const [selectedDiscountYear, setSelectedDiscountYear] = useState("");
    const [discountMode, setDiscountMode] = useState("percentage");
    const [discountValue, setDiscountValue] = useState("");
    const [discountReason, setDiscountReason] = useState("");
    const [applyingDiscount, setApplyingDiscount] = useState(false);
    const [collapsedYears, setCollapsedYears] = useState({});

    // 🔥 FETCH DATA
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            const studentSnap = await getDoc(doc(DB, "students", id));
            if (!studentSnap.exists()) return;

            setStudent({ id: studentSnap.id, ...studentSnap.data() });

            const billsSnap = await getDocs(
                query(
                    collection(DB, "student_bills"), 
                    where("student_id", "==", id)
                )
            );

            const list = billsSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));

            // 🔥 GROUP BY YEAR
            const grouped = {};

            list.forEach((b) => {
                if (!grouped[b.academic_year]) grouped[b.academic_year] = [];
                grouped[b.academic_year].push(b);
            });

            setBills(grouped);

            const years = Object.keys(grouped).sort().reverse();

            if (years.length > 0) {
                setSelectedDiscountYear(years[0]); // latest year auto
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // 🔥 STATS
    const stats = useMemo(() => {
        let total = 0;
        let paid = 0;

        Object.values(bills).forEach((yearBills) => {
            yearBills.forEach((b) => {
                total += Number(b.amount || 0);
                paid += Number(b.paid_amount || 0);
            });
        });

        return {
            total,
            paid,
            unpaid: total - paid,
        };
    }, [bills]);

    //Format receipt code
    const formatReceiptNumber = (num) => {
        return String(num).padStart(6, "0");
    };

    //PAYMENT
    const handlePay = async (bill, mode, customAmount) => {
        if (!bill || payingId === bill.id) return;

        try {
            setPayingId(bill.id);

            const fullAmount = Number(bill.amount);
            const currentPaid = Number(bill.paid_amount || 0);
            const remaining = fullAmount - currentPaid;

            let paymentValue = 0;

            // 🔹 MODE LOGIC
            if (mode === "total") {
                paymentValue = remaining;
            } else {
                const entered = Math.floor(Number(customAmount));

                if (!entered || entered <= 0) {
                    alert("أدخل مبلغ صحيح");
                    return;
                }

                if (entered > remaining) {
                    alert("المبلغ أكبر من المتبقي");
                    return;
                }

                paymentValue = entered;
            }

            // 🔹 ADMIN DATA (from localStorage)
            const adminId = localStorage.getItem("adminSchoolID");
            const adminName = localStorage.getItem("adminDahboardName");

            if (!adminId) {
                alert("لم يتم العثور على حساب المحاسب");
                return;
            }

            await runTransaction(DB, async (transaction) => {
                const billRef = doc(DB, "student_bills", bill.id);
                const schoolRef = doc(DB, "schools", bill.school_id);

                const billSnap = await transaction.get(billRef);

                if (!billSnap.exists()) {
                    throw new Error("BILL_NOT_FOUND");
                }

                const billData = billSnap.data();

                //Already paid
                if (billData.status === "paid") {
                    throw new Error("BILL_ALREADY_PAID");
                }

                //Overpayment protection
                if ((billData.paid_amount || 0) + paymentValue > billData.amount) {
                    throw new Error("OVERPAYMENT");
                }

                const newPaidAmount = (billData.paid_amount || 0) + paymentValue;
                const newRemaining = billData.amount - newPaidAmount;

                let newStatus = "unpaid";
                if (newRemaining <= 0) newStatus = "paid";
                else if (newPaidAmount > 0) newStatus = "partial";

                let receiptNumber = null;

                // Generate receipt ONLY if fully paid
                if (newStatus === "paid" && !billData.receipt_number) {

                    const schoolSnap = await transaction.get(schoolRef);

                    if (!schoolSnap.exists()) {
                        throw new Error("SCHOOL_NOT_FOUND");
                    }

                    const schoolData = schoolSnap.data();
                    const currentCounter = schoolData.receipt_counter || 0;

                    const nextCounter = currentCounter + 1;

                    receiptNumber = formatReceiptNumber(nextCounter);

                    // update counter
                    transaction.update(schoolRef, {
                        receipt_counter: nextCounter
                    });
                }

                const updateData = {
                    paid_amount: newPaidAmount,
                    status: newStatus,
                    paid_at: Timestamp.now(),
                    paid_by_name: adminName,
                    paid_by_id: adminId,
                    updated_at: Timestamp.now(),
                };

                if (receiptNumber) {
                    updateData.receipt_number = receiptNumber;
                }

                transaction.update(billRef, updateData);
            });

            // 🔥 REFRESH
            await fetchData();

            // 🔥 CLOSE MODAL + RESET
            setOpenPaymentModal(false);
            setSelectedBill(null);
            setPaymentValue("");
            setPaymentType("total");

            alert("تم تسجيل الدفع بنجاح");

        } catch (e) {
            console.error(e);

            if (e.message === "BILL_ALREADY_PAID") {
                alert("تم دفع هذا القسط مسبقاً");
            } else if (e.message === "OVERPAYMENT") {
                alert("لا يمكن دفع مبلغ أكبر من المتبقي");
            } else {
                alert("فشل تسجيل الدفع");
            }
        } finally {
            setPayingId(null);
        }
    };
  
    //Download receipt
    const downloadReceipt = async (bill) => {
        try {
            setDownloadingId(bill.id);

            const schoolName = localStorage.getItem("adminSchoolName") || "المدرسة";
            const studentName = `${student.name} ${student.parent_name}`;
            const installmentLabel = `قسط ${bill.installment_index}`;
            const amount = Number(bill.amount).toLocaleString();
            const paidAt = formatDate(bill.paid_at);
            const officer = bill.paid_by_name || "الإدارة";
            const receiptId = bill?.receipt_number || "—";
            const issuedAt = new Date().toLocaleDateString("ar-EG");

            const element = document.createElement("div");

            element.innerHTML = `
                <div style="direction:rtl;font-family:Arial;padding:20px;">
                    <h2 style="text-align:center;color:#8a6115;">وصل دفع</h2>
                    <p style="text-align:center;">${schoolName}</p>

                    <div style="border:1px solid #ddd;border-radius:10px;padding:15px;margin-top:20px;">
          
                        <div style="display:flex;justify-content:flex-start;;align-items:center;gap:20px;margin-bottom:10px;">
                            <strong>الاسم</strong>
                            <span>${studentName}</span>
                        </div>

                        <div style="display:flex;justify-content:flex-start;align-items:center;gap:20px;margin-bottom:10px;">
                            <strong>القسط</strong>
                            <span>${installmentLabel}</span>
                        </div>

                        <div style="display:flex;justify-content:flex-start;align-items:center;gap:20px;margin-bottom:10px;">
                            <strong>المبلغ</strong>
                            <span>${amount}</span>
                        </div>

                        <div style="display:flex;justify-content:flex-start;align-items:center;gap:20px;margin-bottom:10px;">
                            <strong>تاريخ الدفع</strong>
                            <span>${paidAt}</span>
                        </div>

                        <div style="display:flex;justify-content:flex-start;align-items:center;gap:20px;margin-bottom:10px;">
                            <strong>تم بواسطة</strong>
                            <span>${officer}</span>
                        </div>

                        <div style="display:flex;justify-content:flex-start;align-items:center;gap:20px;margin-bottom:10px;">
                            <strong>رقم الوصل</strong>
                            <span>${receiptId}</span>
                        </div>

                    </div>

                    <p style="text-align:center;margin-top:20px;">
                         تم إصدار هذا الوصل بتاريخ ${issuedAt}
                    </p>
                </div>
            `;

            const opt = {
                margin: 10,
                filename: `receipt-${receiptId}.pdf`,
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            };

            await html2pdf().set(opt).from(element).save();

        } catch (e) {
            console.error(e);
            alert("فشل تحميل الوصل");
        } finally {
            setDownloadingId(null);
        }
    };

    //Apply discount
    const handleApplyDiscount = async () => {
        try {
            const val = Math.floor(Number(discountValue));

            if (!val || val <= 0) {
                alert("أدخل قيمة صحيحة");
                return;
            }

            if (!selectedDiscountYear) {
                alert("يرجى اختيار السنة الدراسية");
                return;
            }

            if(!discountReason) {
                alert("يرجى تحديد سبب الخصم");
                return;
            }

            const yearBills = bills[selectedDiscountYear] || [];

            const unpaidBills = yearBills.filter(b => b.status === "unpaid");

            if (unpaidBills.length === 0) {
                alert("لا توجد أقساط غير مدفوعة في هذه السنة");
                return;
            }

            const unpaidTotal = unpaidBills.reduce(
                (sum, b) => sum + Number(b.amount || 0),
                0
            );

            let newUnpaidTotal = 0;
            let discountAmount = 0;

            if (discountMode === "percentage") {
                if (val >= 100) {
                    alert("النسبة يجب أن تكون أقل من 100%");
                    return;
                }

                newUnpaidTotal = Math.floor(unpaidTotal * (1 - val / 100));
                discountAmount = val;
            } else {
                newUnpaidTotal = val;

                if (newUnpaidTotal >= unpaidTotal) {
                    alert("المبلغ يجب أن يكون أقل من غير المدفوع");
                    return;
                }

                discountAmount = unpaidTotal - newUnpaidTotal;
            }

            setApplyingDiscount(true);

            const adminId = localStorage.getItem("adminSchoolID");
            const adminName = localStorage.getItem("adminDahboardName");

            const baseAmount = Math.floor(newUnpaidTotal / unpaidBills.length);
            const remainder = newUnpaidTotal % unpaidBills.length;

            await runTransaction(DB, async (transaction) => {
                unpaidBills.forEach((bill, index) => {
                    const billRef = doc(DB, "student_bills", bill.id);

                    const adjustedAmount =
                    index === unpaidBills.length - 1
                        ? baseAmount + remainder
                        : baseAmount;

                    transaction.update(billRef, {
                        amount: adjustedAmount,
                        discounted: true,
                        discounted_at: Timestamp.now(),
                        discounted_by: adminName,
                        discounted_by_id: adminId,
                        discount_mode: discountMode,
                        discount_value: discountAmount,
                        discount_reason: discountReason || "",
                    });
                });

            });

            await fetchData();

            setOpenDiscountModal(false);
            setDiscountValue("");
            setDiscountReason("");

            alert("تم تطبيق الخصم");

        } catch (e) {
            console.error(e);
            alert("فشل تطبيق الخصم");
        } finally {
            setApplyingDiscount(false);
        }
    };

    //Format bill due date
    const formatDate = (timestamp) => {
        if (!timestamp) return "-";

        const date = timestamp.toDate();

        return date.toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    //Toggle academic year
    const toggleYear = (year) => {
        setCollapsedYears((prev) => ({
            ...prev,
            [year]: !prev[year],
        }));
    };

    const unpaidTotalForYear = useMemo(() => {
        if (!selectedDiscountYear || !bills[selectedDiscountYear]) return 0;

        return bills[selectedDiscountYear]
            .filter(b => b.status === "unpaid")
            .reduce((sum, b) => sum + Number(b.amount || 0), 0);
    }, [bills, selectedDiscountYear]);

    const calculatedNewTotal = useMemo(() => {
        const val = Number(discountValue);

        if (!val || val <= 0) return null;

        if (discountMode === "percentage") {
            if (val >= 100) return null;
            return Math.floor(unpaidTotalForYear * (1 - val / 100));
        } else {
            return val;
        }
    }, [discountValue, discountMode, unpaidTotalForYear]);

    const closeDiscountModal = () => {
        setDiscountMode('percentage');
        setDiscountValue("");
        setDiscountReason("");
        setOpenDiscountModal(false)
    }

    if (loading || !student) {
        return (
            <div className="loader">
                <ClipLoader />
            </div>
        );
    }

    return (
        <div className="students-container">

            <div className="card billing-details-header">
                <h3>{student.name} {student.parent_name}</h3>
                <p>{student.class_name}</p>
            </div>

            <div className="billing-stats">
                <StatBox label="المجموع" value={stats.total.toLocaleString("ar-IQ")} />
                <StatBox label="المدفوع" value={stats.paid.toLocaleString("ar-IQ")} success />
                <StatBox label="المتبقي" value={stats.unpaid.toLocaleString("ar-IQ")} danger />
            </div>

            <div className="discount-btn" onClick={() => setOpenDiscountModal(true)}>
                <p>تعديل الرسوم / خصم</p>
            </div>

            <Modal
                open={openDiscountModal}
                onCancel={closeDiscountModal}
                footer={null}
                centered
            >
                <div className="discount-modal">
                    <h3>تعديل الرسوم</h3>

                    <div className="mode-switcher">
                        <button
                            className={discountMode === "percentage" ? "active" : ""}
                            onClick={() => setDiscountMode("percentage")}
                        >
                            % خصم
                        </button>

                        <button
                            className={discountMode === "amount" ? "active" : ""}
                            onClick={() => setDiscountMode("amount")}
                        >
                             مبلغ جديد
                        </button>
                    </div>

                    <p className="discount-warning">
                         الأقساط المدفوعة لن تتأثر*
                    </p>

                    <select
                        value={selectedDiscountYear}
                        onChange={(e) => setSelectedDiscountYear(e.target.value)}
                    >
                        {Object.keys(bills)
                            .sort((a, b) => b.localeCompare(a))
                            .map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                            ))}
                    </select>

                    <input
                        type="number"
                        placeholder={
                            discountMode === "percentage"
                            ? "مثال: 10%"
                            : "المبلغ السنوي الجديد"
                        }
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                    />

                    <div className="discount-preview">
                        <div className="preview-row">
                            <span>إجمالي غير المدفوع</span>
                            <strong>{unpaidTotalForYear.toLocaleString("ar-IQ")}</strong>
                        </div>
                        {calculatedNewTotal !== null && (
                            <div className="preview-row highlight">
                            <span>بعد الخصم</span>
                            <strong>{calculatedNewTotal.toLocaleString("ar-IQ")}</strong>
                            </div>
                        )}
                    </div>

                    <textarea
                        placeholder="سبب الخصم"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                    />

                    <button
                        className="apply-discount-btn"
                        onClick={handleApplyDiscount}
                    >
                        {applyingDiscount ? <ClipLoader size={15} color="#fff"/> : "تطبيق"}
                    </button>   
                </div>
            </Modal>

            {/* YEARS */}
            {Object.entries(bills)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([year, yearBills]) => (
                    <div key={year} className="card" style={{marginBottom:'10px'}}>
                        <div className="billing-year-header">
                            <h3 className="bill-details-academic-year-label">
                                {year}
                            </h3>
                            <div
                                className="year-toggle-icon"
                                onClick={() => toggleYear(year)}
                            >
                                {collapsedYears[year] ? (
                                    <FaRegPlusSquare />
                                ) : (
                                    <FaRegSquareMinus />
                                )}
                            </div>
                        </div>
                        {!collapsedYears[year] && (
                        <div className="card-content">
                            {yearBills
                                .sort((a, b) => a.installment_index - b.installment_index)
                                .map((bill) => {
                                const remaining = bill.amount - (bill.paid_amount || 0);
                                return (
                                    <div key={bill.id} className= 'bill-card'>
                                        <div className="bill-details-bill-card-header">
                                            <div className={`status-badge ${bill.status}`}>
                                                {bill.status === "paid"
                                                ? "مدفوع"
                                                : bill.status === "partial"
                                                ? "جزئي"
                                                : "غير مدفوع"}
                                            </div>
                                            <h4>قسط {bill.installment_index}</h4>
                                        </div>
                                        <div className="bill-details-bill-card-content">
                                            <p>المبلغ الإجمالي: {bill.amount.toLocaleString("ar-IQ")}</p>
                                            {bill.paid_amount > 0 && (
                                                <>
                                                    <p className="bill-amount-paid">المدفوع: {bill.paid_amount.toLocaleString("ar-IQ")}</p>
                                                    <p className="bill-amount-remaining">المتبقي: {remaining.toLocaleString("ar-IQ")}</p>
                                                </>
                                            )}
                                            {bill.status === "paid" ? (
                                                <p>تم الدفع بتاريخ : {formatDate(bill.paid_at)}</p>
                                            ) : (
                                                <p>موعد الدفع : {formatDate(bill.due_date)}</p>
                                            )}                                        
                                        </div>

                                        {bill.discounted && (
                                            <div className="discount-badge-box">
                                                <div className="discount-badge">
                                                    <span className="discount-reason">خصم</span>
                                                    <span className="discount-reason">
                                                        {bill.discount_mode === "percentage"
                                                            ? `%${bill.discount_value}`
                                                            : `${bill.discount_value}`}
                                                    </span>

                                                    <span className="discount-reason">-</span>

                                                    {bill.discount_reason && (
                                                        <span className="discount-reason">
                                                            {bill.discount_reason}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {bill.status !== "paid" && (
                                            <div className="expand-btn-container">
                                                <div
                                                    className="expand-btn"
                                                    onClick={() => {
                                                        setSelectedBill(bill);
                                                        setPaymentType("total");
                                                        setPaymentValue("");
                                                        setOpenPaymentModal(true);
                                                    }}
                                                >
                                                    <p>تسجيل كمدفوع</p>
                                                </div>
                                            </div>
                                        )}

                                        {bill.status === "paid" && (
                                            <div className="expand-btn-container">
                                                <button
                                                    className="upload-bill-receit"
                                                    onClick={() => downloadReceipt(bill)}
                                                >
                                                    {downloadingId === bill.id ? (
                                                        <ClipLoader size={15} color="#fff" />
                                                    ) : (
                                                        "تحميل الوصل"
                                                    )}
                                                </button>
                                            </div>                                        
                                        )}
                                    </div>
                                );
                            })}
                            <Modal
                                open={openPaymentModal}
                                onCancel={() => setOpenPaymentModal(false)}
                                footer={null}
                                centered
                            >
                                <div className="payment-modal">
                                    <h3>تسجيل الدفع</h3>
                                    <div className="mode-switcher">
                                        <button
                                            className={paymentType === "total" ? "active" : ""}
                                            onClick={() => setPaymentType("total")}
                                        >
                                             كامل
                                        </button>
                                        <button
                                            className={paymentType === "partial" ? "active" : ""}
                                            onClick={() => setPaymentType("partial")}
                                        >
                                             جزئي
                                        </button>
                                    </div>

                                    {paymentType === "partial" && (
                                        <input
                                            type="number"
                                            placeholder="أدخل المبلغ"
                                            value={paymentValue}
                                            onChange={(e) => setPaymentValue(e.target.value)}
                                        />
                                    )}

                                    <button
                                        className="pay-btn"
                                        disabled={payingId === selectedBill?.id}
                                        onClick={() =>
                                            handlePay(selectedBill, paymentType, paymentValue)
                                        }
                                    >
                                        {payingId === selectedBill?.id ? (
                                            <ClipLoader size={15} color="#fff" />
                                        ) : (
                                            "تأكيد الدفع"
                                        )}
                                    </button>

                                </div>
                            </Modal>
                        </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

export default BillingDetails;

const StatBox = ({ label, value, success, danger }) => (
    <div className={`stat-box ${success ? "success" : danger ? "danger" : "total"}`}>
        <p style={{fontSize:'14px'}}>{label}</p>
        <h3 style={{fontSize:'14px'}}>{value}</h3>
    </div>
);