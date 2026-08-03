"use client";

import React, { createContext, useReducer, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { DB } from "./firebaseConfig";

const GlobalStateContext = createContext();

const initialState = {
  students: [],
  teachers: [],
  employees: [],
  classes: [],
  studentsRequests: [],
  bills: [],
  loading: true,
  error: null,
};

const reducer = (state, action) => {
  switch (action.type) {
    case "SET_DATA":
      return { ...state, ...action.payload, loading: false };
    case "ERROR":
      return { ...state, error: action.error, loading: false };
    default:
      return state;
  }
};

export const GlobalStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [schoolId, setSchoolId] = useState(null);

  useEffect(() => {
    const id = localStorage.getItem("adminSchoolID");
    if (id) setSchoolId(id);
  }, []);

  useEffect(() => {
    if (!schoolId) return;

    const fetchData = async () => {
      try {
        const isAll = schoolId === 'ALL';

        const makeQuery = (col, field) =>
          isAll
            ? getDocs(collection(DB, col))
            : getDocs(query(collection(DB, col), where(field, "==", schoolId)));

        const [
          studentsSnap,
          teachersSnap,
          employeesSnap,
          classesSnap,
          studentsRequestsSnap,
          billsSnap
        ] = await Promise.all([
          makeQuery("students", "school_id"),
          makeQuery("teachers", "school_id"),
          makeQuery("employees", "school_id"),
          makeQuery("classes", "schoolId"),
          makeQuery("students_requests", "school_id"),
          makeQuery("student_bills", "school_id"),
        ]);

        dispatch({
          type: "SET_DATA",
          payload: {
            students: studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            teachers: teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            employees: employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            classes: classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            studentsRequests: studentsRequestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            bills: billsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          },
        });

      } catch (error) {
        dispatch({ type: "ERROR", error });
      }
    };

    fetchData();
  }, [schoolId]);

  return (
    <GlobalStateContext.Provider value={state}>
      {children}
    </GlobalStateContext.Provider>
  );
};

export const useGlobalState = () => React.useContext(GlobalStateContext);