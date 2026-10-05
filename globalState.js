"use client";

import React, { createContext, useReducer, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase, fetchAll, publicUrl } from "./supabaseClient";

const GlobalStateContext = createContext();

const PUBLIC_PATHS = ["/login"];

const initialState = {
  students: [],
  teachers: [],
  employees: [],
  classes: [],
  studentsRequests: [],
  bills: [],
  drivers: [],
  lines: [],
  loading: true,
  error: null,
};

const reducer = (state, action) => {
  switch (action.type) {
    case "SET_DATA":
      return { ...state, ...action.payload, loading: false, error: null };
    case "LOADING":
      return { ...state, loading: true };
    case "RESET":
      return { ...initialState, loading: false };
    case "ERROR":
      return { ...state, error: action.error, loading: false };
    default:
      return state;
  }
};

// Signed URLs for files in a private bucket, keyed by storage path
const signPaths = async (bucket, paths) => {
  const unique = [...new Set(paths.filter(Boolean))];

  if (!unique.length) return new Map();

  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 3600);

  return new Map((data || []).filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]));
};

// Rows are mapped to the shapes the dashboard screens already use
const loadAll = async () => {
  const [students, teachers, employees, classes, requests, bills, drivers, lines, schools, subjects, subjectClasses] =
    await Promise.all([
      fetchAll("students"),
      fetchAll("teachers"),
      fetchAll("employees"),
      fetchAll("classes"),
      fetchAll("students_requests"),
      fetchAll("student_bills"),
      fetchAll("drivers"),
      fetchAll("lines"),
      fetchAll("schools", "id,name,location_lat,location_lng"),
      fetchAll("teacher_subjects"),
      fetchAll("teacher_subject_classes", "*", "teacher_subject_id"),
    ]);

  const [studentPhotos, teacherPhotos, employeePhotos, driverMedia] = await Promise.all([
    signPaths("student-photos", students.map((s) => s.photo_path)),
    signPaths("teacher-photos", teachers.map((t) => t.photo_path)),
    signPaths("employee-photos", employees.map((e) => e.photo_path)),
    signPaths("driver-media", drivers.flatMap((d) => [d.personal_image_path, d.car_image_path])),
  ]);

  const classById = new Map(classes.map((c) => [c.id, c]));
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const schoolById = new Map(schools.map((s) => [s.id, s]));

  const ridersByLine = new Map();
  students.forEach((s) => {
    if (!s.line_id) return;
    if (!ridersByLine.has(s.line_id)) ridersByLine.set(s.line_id, []);
    ridersByLine.get(s.line_id).push(s.id);
  });

  const linesByDriver = new Map();
  lines.forEach((l) => {
    if (!l.driver_id) return;
    if (!linesByDriver.has(l.driver_id)) linesByDriver.set(l.driver_id, []);
    linesByDriver.get(l.driver_id).push(l.id);
  });

  // teacher -> { subject_key: { name, class_ids } }
  const classIdsBySubject = new Map();
  subjectClasses.forEach((r) => {
    if (!classIdsBySubject.has(r.teacher_subject_id)) classIdsBySubject.set(r.teacher_subject_id, []);
    classIdsBySubject.get(r.teacher_subject_id).push(r.class_id);
  });
  const subjectsByTeacher = new Map();
  subjects.forEach((s) => {
    if (!subjectsByTeacher.has(s.teacher_id)) subjectsByTeacher.set(s.teacher_id, {});
    subjectsByTeacher.get(s.teacher_id)[s.subject_key] = {
      name: s.subject_name,
      class_ids: classIdsBySubject.get(s.id) || [],
    };
  });

  return {
    students: students.map((s) => {
      const cls = classById.get(s.class_id);
      const school = schoolById.get(s.school_id);
      return {
        ...s,
        class_name: cls?.name || null,
        class_grade: cls?.grade || null,
        linked_parent: s.linked_parent_id,
        driver_id: lineById.get(s.line_id)?.driver_id || null,
        destination: school?.name || null,
        home_location:
          s.home_lat != null && s.home_lng != null
            ? { latitude: s.home_lat, longitude: s.home_lng }
            : null,
        photo_url: studentPhotos.get(s.photo_path) || null,
      };
    }),
    teachers: teachers.map((t) => ({
      ...t,
      username: t.phone_number,
      subjects: subjectsByTeacher.get(t.id) || {},
      photo_url: teacherPhotos.get(t.photo_path) || null,
    })),
    employees: employees.map((e) => ({
      ...e,
      username: e.phone_number,
      photo_url: employeePhotos.get(e.photo_path) || null,
    })),
    classes: classes.map((c) => ({
      ...c,
      schoolId: c.school_id,
      educationLevel: c.education_level,
      createdAt: c.created_at,
    })),
    studentsRequests: requests,
    bills,
    drivers: drivers.map((d) => ({
      ...d,
      personal_image: driverMedia.get(d.personal_image_path) || null,
      car_image: driverMedia.get(d.car_image_path) || null,
      lines: linesByDriver.get(d.id) || [],
    })),
    lines: lines.map((l) => {
      const school = schoolById.get(l.school_id);
      return {
        ...l,
        destination: school?.name || null,
        riders: ridersByLine.get(l.id) || [],
      };
    }),
  };
};

export const GlobalStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pathname = usePathname();
  const router = useRouter();
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: "SET_DATA", payload: await loadAll() });
      loadedRef.current = true;
    } catch (error) {
      dispatch({ type: "ERROR", error });
    }
  }, []);

  // Data is read only for a signed-in user; it loads once and screens call refresh() after changes
  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
    let cancelled = false;

    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!data.session) {
        loadedRef.current = false;
        dispatch({ type: "RESET" });
        if (!isPublic) router.replace("/login");
        return;
      }

      if (!isPublic && !loadedRef.current) {
        dispatch({ type: "LOADING" });
        await refresh();
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [pathname, refresh, router]);

  return (
    <GlobalStateContext.Provider value={{ ...state, refresh }}>
      {children}
    </GlobalStateContext.Provider>
  );
};

export const useGlobalState = () => React.useContext(GlobalStateContext);
