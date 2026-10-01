"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useGlobalState } from "../globalState";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { MdPeople, MdSchool, MdWork, MdClass } from "react-icons/md";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import createGlobe from "cobe";
import '../app/style.css';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const GOLD = "#8a6115";
const GOLD_LIGHT = "#d4af37";

const Globe = () => {
  const canvasRef = useRef(null);
  const [logo, setLogo] = useState("");
  const [schoolName, setSchoolName] = useState("");
  useEffect(() => {
    const stored = localStorage.getItem("schoolLogo");
    if (stored && stored !== "undefined" && stored !== "null") setLogo(stored);
    const name = localStorage.getItem("adminSchoolName");
    if (name && name !== "undefined" && name !== "null") setSchoolName(name);
  }, []);
  useEffect(() => {
    let phi = 0;
    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: 320,
      height: 320,
      phi: 0,
      theta: 0.3,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.87, 0.76, 0.42],
      markerColor: [0.54, 0.38, 0.08],
      glowColor: [0.97, 0.93, 0.82],
      markers: [],
      onRender(state) {
        state.phi = phi;
        phi += 0.004;
      },
    });
    return () => globe.destroy();
  }, []);
  return (
    <>
      {schoolName && <h2 className="school-name-title">{schoolName}</h2>}
      <div className="globe-canvas-wrap">
        <canvas ref={canvasRef} className="globe-canvas" width={320} height={320} />
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="شعار المدرسة" className="globe-logo" onError={() => setLogo("")} />
        ) : (
          <span className="globe-letter">S</span>
        )}
      </div>
    </>
  );
};

const Main = () => {
  const { students, teachers, employees, classes, bills, loading } = useGlobalState();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    setTimeout(() => {
      localStorage.removeItem("adminLoggedIn");
      localStorage.removeItem("adminDahboardName");
      sessionStorage.clear();
      router.push("/login");
    }, 300);
  };

  const activeStudents = students.filter(s => !s.account_deleted);
  const activeTeachers = teachers.filter(t => !t.account_deleted);
  const activeEmployees = employees.filter(e => !e.account_deleted);

  const stats = [
    { title: "إجمالي الطلاب",   value: activeStudents.length, icon: MdSchool },
    { title: "إجمالي المدرسين",  value: activeTeachers.length, icon: MdPeople },
    { title: "إجمالي الموضفين",  value: activeEmployees.length, icon: MdWork },
    { title: "إجمالي الصفوف",    value: classes.length,         icon: MdClass },
  ];

  const staffDoughnut = useMemo(() => ({
    labels: ["الطلاب", "المدرسين", "الموظفين"],
    datasets: [{
      data: [activeStudents.length, activeTeachers.length, activeEmployees.length],
      backgroundColor: [GOLD, "#d4af37", "#c8a96e"],
      borderWidth: 2,
      borderColor: "#fff",
    }],
  }), [activeStudents.length, activeTeachers.length, activeEmployees.length]);

  const classBar = useMemo(() => {
    const countMap = {};
    activeStudents.forEach(s => {
      if (s.class_name) countMap[s.class_name] = (countMap[s.class_name] || 0) + 1;
    });
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      labels: sorted.map(([name]) => name),
      datasets: [{ label: "عدد الطلاب", data: sorted.map(([, c]) => c), backgroundColor: GOLD, borderRadius: 6 }],
    };
  }, [activeStudents]);

  const billingDoughnut = useMemo(() => {
    let paid = 0, partial = 0, unpaid = 0;
    bills.forEach(b => {
      const rem = Math.max(Number(b.amount || 0) - Number(b.paid_amount || 0), 0);
      if (rem === 0) paid++;
      else if (Number(b.paid_amount || 0) > 0) partial++;
      else unpaid++;
    });
    return {
      labels: ["مدفوع بالكامل", "مدفوع جزئياً", "غير مدفوع"],
      datasets: [{ data: [paid, partial, unpaid], backgroundColor: ["#22c55e", GOLD_LIGHT, "#ef4444"], borderWidth: 2, borderColor: "#fff" }],
    };
  }, [bills]);

  const financeBar = useMemo(() => {
    let totalAmount = 0, totalPaid = 0;
    bills.forEach(b => { totalAmount += Number(b.amount || 0); totalPaid += Number(b.paid_amount || 0); });
    return {
      labels: ["إجمالي الرسوم", "المدفوع", "المتبقي"],
      datasets: [{ label: "المبلغ (د.ع)", data: [totalAmount, totalPaid, Math.max(totalAmount - totalPaid, 0)], backgroundColor: [GOLD, "#22c55e", "#ef4444"], borderRadius: 6 }],
    };
  }, [bills]);

  const doughnutOpts = { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { family: "inherit" } } } } };
  const barOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };
  const financeBarOpts = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+"م" : v >= 1000 ? (v/1000).toFixed(0)+"ك" : v } } },
  };

  return (
    <div className="main-container">
      <h2 className="main-title">نظرة عامة</h2>
      <div className="logout-btn" onClick={handleLogout}>تسجيل الخروج</div>

      {loggingOut && (
        <div className="page-loading-overlay">
          <ClipLoader size={40} color="#000" />
          <p>جاري تسجيل الخروج...</p>
        </div>
      )}

      <div className="overview-row">
        <div className="stats-grid">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="stat-card">
                <div className="stat-icon"><Icon size={22} /></div>
                <div className="stat-info">
                  <p>{stat.title}</p>
                  {loading ? <ClipLoader size={10} color="#8a6115" /> : <h3>{stat.value}</h3>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="globe-wrapper">
          <Globe />
        </div>
      </div>

      {!loading && (
        <div className="charts-section">
          <div className="charts-row">
            <div className="chart-card">
              <h4 className="chart-title">كوادر المدرسة</h4>
              <div className="chart-doughnut-wrap">
                <Doughnut data={staffDoughnut} options={doughnutOpts} />
              </div>
            </div>
            <div className="chart-card">
              <h4 className="chart-title">حالة الحسابات</h4>
              <div className="chart-doughnut-wrap">
                <Doughnut data={billingDoughnut} options={doughnutOpts} />
              </div>
            </div>
          </div>

          {classBar.labels.length > 0 && (
            <div className="chart-card chart-card-full">
              <h4 className="chart-title">توزيع الطلاب على الصفوف (أعلى 10)</h4>
              <div className="chart-bar-wrap">
                <Bar data={classBar} options={barOpts} />
              </div>
            </div>
          )}

          {bills.length > 0 && (
            <div className="chart-card chart-card-full">
              <h4 className="chart-title">الملخص المالي (د.ع)</h4>
              <div className="chart-bar-wrap">
                <Bar data={financeBar} options={financeBarOpts} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Main;