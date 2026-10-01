"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import ClipLoader from "react-spinners/ClipLoader";
import { DB } from "../firebaseConfig";
import { useGlobalState } from "../globalState";
import "../app/style.css";

const lineNumberValue = (line) => parseInt(line.line_number?.replace("L", "")) || 0;

const getCurrentAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

// +9647XXXXXXXXX → 07XXXXXXXXX
const toLocalPhone = (phone) => {
  if (!phone) return "-";
  const value = String(phone).trim();
  if (value.startsWith("+964")) return `0${value.slice(4)}`;
  if (value.startsWith("+216")) return value.slice(4);
  if (/^7\d{9}$/.test(value)) return `0${value}`;
  return value;
};

const localDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Statuses are written by the driver app during a trip
const attendanceText = (trip, studentId) => {
  if (!trip) return "-";
  const status = trip.students?.[studentId];
  if (status === "picked_up" || status === "dropped_off") return "حاضر";
  if (status === "absent") return "غائب";
  if (status === "waiting") return "بانتظار";
  return "-";
};

const DIRECTIONS = [
  { key: "to_school", label: "الذهاب (من البيت إلى المدرسة)", short: "الذهاب" },
  { key: "to_home", label: "الإياب (من المدرسة إلى البيت)", short: "الإياب" },
];

const TransportReport = () => {
  const { lines, drivers, students, classes, loading } = useGlobalState();

  const reportRef = useRef(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolLogo, setSchoolLogo] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState("");
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [extraPhone, setExtraPhone] = useState("");
  const [fare, setFare] = useState("");
  const [fareTouched, setFareTouched] = useState(false);
  const [fetchedDriver, setFetchedDriver] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [tripDate, setTripDate] = useState(localDateKey(new Date()));
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);

  const currentYear = new Date().getFullYear();
  const academicYears = Array.from(
    new Set([
      `${currentYear - 1}-${currentYear}`,
      `${currentYear}-${currentYear + 1}`,
      getCurrentAcademicYear(),
    ])
  ).sort();

  useEffect(() => {
    const name = localStorage.getItem("adminSchoolName");
    const logo = localStorage.getItem("schoolLogo");
    if (name && name !== "undefined" && name !== "null") setSchoolName(name);
    if (logo && logo !== "undefined" && logo !== "null") setSchoolLogo(logo);
  }, []);

  const sortedLines = useMemo(
    () => [...lines].sort((a, b) => lineNumberValue(a) - lineNumberValue(b)),
    [lines]
  );

  useEffect(() => {
    if (!selectedLineId && sortedLines.length > 0) {
      setSelectedLineId(sortedLines[0].id);
    }
  }, [sortedLines, selectedLineId]);

  const line = useMemo(
    () => lines.find((l) => l.id === selectedLineId) || null,
    [lines, selectedLineId]
  );

  const listedDriver = useMemo(
    () => (line ? drivers.find((d) => d.id === line.driver_id) || null : null),
    [line, drivers]
  );

  // Drivers created by the Team dashboard are not in the school's driver list
  useEffect(() => {
    setFetchedDriver(null);
    if (!line?.driver_id || listedDriver) return;

    let cancelled = false;
    getDoc(doc(DB, "drivers", line.driver_id))
      .then((snap) => {
        if (!cancelled && snap.exists()) setFetchedDriver({ id: snap.id, ...snap.data() });
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [line, listedDriver]);

  const driver = listedDriver || fetchedDriver;

  // Trips are written by the driver app, one document per direction per day
  useEffect(() => {
    setTrips([]);
    if (!line?.id) return;

    let cancelled = false;
    setLoadingTrips(true);
    getDocs(query(collection(DB, "trips"), where("line_id", "==", line.id)))
      .then((snap) => {
        if (!cancelled) setTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadingTrips(false);
      });

    return () => {
      cancelled = true;
    };
  }, [line?.id]);

  // Latest trip of the selected day for each direction
  const dayTrips = useMemo(() => {
    const result = { to_school: null, to_home: null };

    trips.forEach((t) => {
      if (!t.started_at?.toDate || !(t.direction in result)) return;
      if (localDateKey(t.started_at.toDate()) !== tripDate) return;

      const current = result[t.direction];
      if (!current || t.started_at.toMillis() > current.started_at.toMillis()) {
        result[t.direction] = t;
      }
    });

    return result;
  }, [trips, tripDate]);

  const lineStudents = useMemo(() => {
    if (!line) return [];
    return students
      .filter((s) => s.line_id === line.id && !s.account_deleted)
      .sort((a, b) =>
        `${a.name} ${a.parent_name}`.localeCompare(`${b.name} ${b.parent_name}`, "ar")
      );
  }, [students, line]);

  const classById = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes]
  );

  const subscriptionsTotal = useMemo(
    () => lineStudents.reduce((sum, s) => sum + (Number(s.subscription_amount) || 0), 0),
    [lineStudents]
  );

  const attendanceSummary = useMemo(() => {
    const summary = {};
    DIRECTIONS.forEach(({ key }) => {
      const present = lineStudents.filter((s) => attendanceText(dayTrips[key], s.id) === "حاضر").length;
      const absent = lineStudents.filter((s) => attendanceText(dayTrips[key], s.id) === "غائب").length;
      summary[key] = { present, absent };
    });
    return summary;
  }, [lineStudents, dayTrips]);

  const hasDayTrips = Boolean(dayTrips.to_school || dayTrips.to_home);
  const tripDateLabel = new Date(`${tripDate}T00:00:00`).toLocaleDateString("ar-IQ", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Fare defaults to the line's subscriptions until the user edits it
  useEffect(() => {
    setFareTouched(false);
  }, [selectedLineId]);

  const fareValue = fareTouched ? fare : subscriptionsTotal ? String(subscriptionsTotal) : "";
  const fareText = fareValue ? `${Number(fareValue).toLocaleString("ar-IQ")} د.ع` : "-";

  const phones = [toLocalPhone(driver?.phone_number)];
  if (extraPhone.trim()) phones.push(extraPhone.trim());

  const handlePrint = () => window.print();

  const handleExportPdf = async () => {
    if (!reportRef.current) return;

    try {
      setExporting(true);

      // html2pdf touches `self` on import, so it can only load in the browser
      const html2pdf = (await import("html2pdf.js")).default;

      await html2pdf()
        .set({
          margin: 8,
          filename: `تقرير-${line?.line_number || "خط"}-${academicYear}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: "tr" },
        })
        .from(reportRef.current)
        .save();
    } catch (e) {
      console.error(e);
      alert("فشل تصدير التقرير");
    } finally {
      setExporting(false);
    }
  };

  // Same-origin copy of the logo so PDF export is not blocked by CORS
  const schoolLogoSrc = schoolLogo
    ? logoFailed
      ? schoolLogo
      : `/_next/image?url=${encodeURIComponent(schoolLogo)}&w=384&q=100`
    : "";

  const today = new Date().toLocaleDateString("ar-IQ");

  return (
    <div className="students-container">
      <div className="students-header report-controls">
        <h2>تقرير النقل</h2>
      </div>

      {loading ? (
        <div className="loader">
          <ClipLoader size={30} color="#8a6115" />
        </div>
      ) : sortedLines.length === 0 ? (
        <div className="empty">لا توجد خطوط، أنشئ خطاً من قسم الخطوط أولاً</div>
      ) : (
        <>
          <div className="report-controls report-controls-box">
            <div className="input-group">
              <label>الخط</label>
              <select value={selectedLineId} onChange={(e) => setSelectedLineId(e.target.value)}>
                {sortedLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.line_number} - {l.line_name || l.destination}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label>العام الدراسي</label>
              <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                {academicYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label>تاريخ اليومية (الحضور والغياب)</label>
              <input
                type="date"
                value={tripDate}
                onChange={(e) => e.target.value && setTripDate(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>رقم هاتف إضافي للسائق (اختياري)</label>
              <input
                type="text"
                inputMode="tel"
                placeholder="07XXXXXXXXX"
                value={extraPhone}
                onChange={(e) => setExtraPhone(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>الأجرة (د.ع)</label>
              <input
                type="number"
                min="0"
                placeholder="الأجرة"
                value={fareValue}
                onChange={(e) => {
                  setFareTouched(true);
                  setFare(e.target.value);
                }}
              />
            </div>

            <div className="report-actions">
              <button className="create-submit" onClick={handlePrint}>طباعة</button>
              <button className="create-submit" onClick={handleExportPdf} disabled={exporting}>
                {exporting ? <ClipLoader size={14} color="#fff" /> : "تصدير PDF"}
              </button>
            </div>
          </div>

          <div className="transport-report" ref={reportRef}>
            <div className="report-header">
              <div className="report-logo-frame contain">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.png" alt="SAFE" />
              </div>

              <div className="report-title-box">
                <h1>تقرير النقل المدرسي</h1>
                {schoolName && <h2>{schoolName}</h2>}
                <p>تاريخ التقرير: {today}</p>
              </div>

              <div className="report-logo-frame">
                {schoolLogoSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={schoolLogoSrc}
                    alt="شعار المدرسة"
                    onError={() => setLogoFailed(true)}
                  />
                )}
              </div>
            </div>

            <table className="report-info-table">
              <tbody>
                <tr>
                  <th>اسم السائق</th>
                  <td>{driver?.name || line?.driver_name || "لا يوجد سائق"}</td>
                  <th>رقم الهاتف</th>
                  <td>
                    {phones.map((p, i) => (
                      <div key={i} className="phone-number">{p}</div>
                    ))}
                  </td>
                </tr>
                <tr>
                  <th>نوع السيارة</th>
                  <td>{driver?.car_type || line?.car_type || "-"}</td>
                  <th>رقم السيارة</th>
                  <td>{driver?.car_plate || "-"}</td>
                </tr>
                <tr>
                  <th>الأجرة</th>
                  <td>{fareText}</td>
                  <th>الخط</th>
                  <td>{line?.line_number} - {line?.line_name || line?.destination}</td>
                </tr>
              </tbody>
            </table>

            <p className="report-year">العام الدراسي: {academicYear}</p>

            <p className="report-day">اليومية: {tripDateLabel}</p>
            <table className="report-info-table report-attendance-summary">
              <tbody>
                {DIRECTIONS.map(({ key, label }) => (
                  <tr key={key}>
                    <th>{label}</th>
                    <td>
                      {loadingTrips
                        ? "جاري التحميل..."
                        : dayTrips[key]
                          ? `حاضر: ${attendanceSummary[key].present} — غائب: ${attendanceSummary[key].absent}`
                          : "لا توجد رحلة مسجلة"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="report-students-table">
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>ت</th>
                  <th>اسم الطالب</th>
                  <th>الصف / المرحلة</th>
                  <th>الشعبة</th>
                  <th>عنوان السكن</th>
                  <th>رقم ولي الأمر</th>
                  <th>الاشتراك الشهري</th>
                  <th>الذهاب</th>
                  <th>الإياب</th>
                </tr>
              </thead>
              <tbody>
                {lineStudents.length === 0 ? (
                  <tr>
                    <td colSpan={9}>لا يوجد طلاب في هذا الخط</td>
                  </tr>
                ) : (
                  lineStudents.map((s, index) => (
                    <tr key={s.id}>
                      <td>{index + 1}</td>
                      <td>{s.name} {s.parent_name}</td>
                      <td>{s.class_grade || "-"}</td>
                      <td>{classById.get(s.class_id)?.section || "-"}</td>
                      <td>{s.home_address || "-"}</td>
                      <td className="phone-number">{toLocalPhone(s.phone_number)}</td>
                      <td>
                        {Number(s.subscription_amount) > 0
                          ? `${Number(s.subscription_amount).toLocaleString("ar-IQ")} د.ع`
                          : "-"}
                      </td>
                      <td className={attendanceText(dayTrips.to_school, s.id) === "غائب" ? "report-absent" : ""}>
                        {attendanceText(dayTrips.to_school, s.id)}
                      </td>
                      <td className={attendanceText(dayTrips.to_home, s.id) === "غائب" ? "report-absent" : ""}>
                        {attendanceText(dayTrips.to_home, s.id)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <p className="report-total">
              عدد الطلاب: {lineStudents.length}
              {" — "}
              إجمالي الاشتراكات الشهرية: {subscriptionsTotal.toLocaleString("ar-IQ")} د.ع
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TransportReport;
