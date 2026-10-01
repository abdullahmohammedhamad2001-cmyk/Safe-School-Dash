"use client";

import React, { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGlobalState } from "../../../globalState";
import ClipLoader from "react-spinners/ClipLoader";
import { IoArrowBackCircle } from "react-icons/io5";
import "../../style.css";

const DriverDetails = () => {
  const { id } = useParams();
  const router = useRouter();

  const { drivers, lines, students, loading } = useGlobalState();

  const driver = drivers.find((d) => d.id === id);

  const driverLines = useMemo(() => {
    if (!driver) return [];
    return lines.filter((line) => line.driver_id === driver.id);
  }, [lines, driver]);

  const lineStudentsMap = useMemo(() => {
    const map = {};
    driverLines.forEach((line) => {
      map[line.id] = students.filter((s) => s.line_id === line.id);
    });
    return map;
  }, [students, driverLines]);

  if (loading) {
    return (
      <div className="loader">
        <ClipLoader size={40} color="#8a6115" />
      </div>
    );
  }

  if (!driver) {
    return <div className="empty">السائق غير موجود</div>;
  }

  return (
    <div className="driver-details-container">
      <div className="back-btn" onClick={() => router.back()}>
        <IoArrowBackCircle size={26} />
      </div>

      <div className="driver-card">
        <div className="driver-card-top">
          <div className="driver-image">
            {driver.personal_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driver.personal_image} alt={driver.name} />
            ) : (
              <div className="placeholder" />
            )}
          </div>

          <div className="driver-info">
            <h2>{driver.name}</h2>
            <p className="phone-number">{driver.phone_number}</p>
            <div className="driver-meta">
              <span>{driver.car_type}</span>
              <span>المقاعد: {driver.car_seats}</span>
              <span>اللوحة: {driver.car_plate}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="driver-section">
        <h3>صورة السيارة</h3>
        <div className="car-image-box">
          {driver.car_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driver.car_image} alt="صورة السيارة" />
          ) : (
            <div className="placeholder" />
          )}
        </div>
      </div>

      <div className="driver-section">
        <h3>الخطوط ({driverLines.length})</h3>

        {driverLines.length === 0 ? (
          <p className="empty">لا يوجد خطوط</p>
        ) : (
          <div className="lines-groups">
            {driverLines.map((line) => (
              <div key={line.id} className="line-card">
                <div className="line-header" style={{ cursor: "pointer" }} onClick={() => router.push(`/lines/${line.id}`)}>
                  <h4>{line.line_name || line.line_number}</h4>
                  <span>
                    {line.destination || "-"} — {lineStudentsMap[line.id]?.length || 0} طالب
                  </span>
                </div>

                <div className="line-table">
                  <div className="line-table-header">
                    <span>اسم الطالب</span>
                    <span>الهاتف</span>
                  </div>

                  {lineStudentsMap[line.id]?.map((student) => (
                    <div key={student.id} className="line-table-row">
                      <span>{student.name}</span>
                      <span className="phone-number">{student.phone_number}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDetails;
