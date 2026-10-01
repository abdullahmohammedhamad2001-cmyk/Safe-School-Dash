"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import {MdDashboard,MdPeople,MdSchool} from "react-icons/md";
import { PiBagSimpleFill } from "react-icons/pi";
import { FaBook, FaCar } from "react-icons/fa";
import { MdCreateNewFolder, MdDirectionsBus, MdAssessment } from "react-icons/md";
import { BsFillCreditCardFill } from "react-icons/bs";
import { IoDocumentText } from "react-icons/io5";
import './style.css';
import Image from 'next/image'
import logo from '../images/notification-icon.png'

// Components
import Main from "../components/main";
import Students from "../components/students";
import Teachers from "../components/teachers";
import Employees from "../components/employees";
import Classes from "../components/classes";
import Lines from "../components/lines";
import Drivers from "../components/drivers";
import StudentsRequests from "../components/studentsRequests";
import Bills from "../components/bills";
import BillingTemplate from "../components/BillingTemplate";
import TransportReport from "../components/transportReport";

const Dashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeSection, setActiveSection] = useState("الرئيسية");
  const [schoolLogo, setSchoolLogo] = useState("");
  const router = useRouter();

  useEffect(() => {
    const adminLoggedIn = localStorage.getItem("adminLoggedIn");
    const storedLogo = localStorage.getItem("schoolLogo");
    if (storedLogo && storedLogo !== "undefined" && storedLogo !== "null") setSchoolLogo(storedLogo);

    if (!adminLoggedIn) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
    }

  }, []);

  if (!isAuthenticated) {
    return (
      <div className="loader-container">
        <ClipLoader color="#8a6115" size={50} />
      </div>
    );
  }

  const links = [
    { label: "الرئيسية", icon: MdDashboard },
    { label: "الطلاب", icon: MdSchool},
    { label: "المدرسين", icon: MdPeople},
    { label: "الموضفين", icon: PiBagSimpleFill},
    { label: "الصفوف", icon: FaBook},
    { label: "الخطوط", icon: MdDirectionsBus },
    { label: "السواق", icon: FaCar },
    { label: "طلبات التسجيل", icon: MdCreateNewFolder },
    { label: "الحسابات", icon: BsFillCreditCardFill},
    { label: "الفاتورة السنوية", icon: IoDocumentText },
    { label: "تقرير النقل", icon: MdAssessment },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "الرئيسية":
        return <Main/>;
      case "الطلاب":
        return <Students/>;
      case "المدرسين":
        return <Teachers/>;
      case "الموضفين":
        return <Employees/>;
      case "الصفوف":
        return <Classes/>;
      case "الخطوط":
        return <Lines/>;
      case "السواق":
        return <Drivers/>;
      case "طلبات التسجيل":
        return <StudentsRequests/>;
      case "الحسابات":
        return <Bills/>;
      case "الفاتورة السنوية":
        return <BillingTemplate/>
      case "تقرير النقل":
        return <TransportReport/>;
      default:
        return <Main />;
    }
  };

  return (
    <div className="dashboard-container">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {schoolLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={schoolLogo}
              width={54}
              height={54}
              alt='شعار المدرسة'
              style={{objectFit:'contain'}}
              onError={() => setSchoolLogo("")}
            />
          ) : (
            <Image
              src={logo}
              width={54}
              height={54}
              alt='شعار لوحة تحكم المدارس'
              style={{objectFit:'contain'}}
              priority
            />
          )}
        </div>

        <div className="sidebar-links">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = activeSection === link.label;

            return (
              <div
                key={link.label}
                onClick={() => setActiveSection(link.label)}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                {link.label}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
};

export default Dashboard;