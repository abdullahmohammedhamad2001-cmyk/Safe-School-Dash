import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const supabase = createClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Staff accounts sign in with a username; the auth email is derived from it.
export const emailFor = (kind, username) =>
    `${kind}.${String(username).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_")}@staff.safeschool.invalid`;

export const publicUrl = (bucket, path) =>
    path ? `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` : null;

// Storage keys must be ASCII; keep only the extension of the original file name.
export const storageName = (file) => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;
};

export const fileExt = (file) =>
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";

// Returns an Arabic error message, or null when the file is an acceptable image.
export const imageError = (file) => {
    if (!file.type.startsWith("image/")) return "يرجى اختيار صورة";
    if (file.size > 5 * 1024 * 1024) return "حجم الصورة يجب ألا يتجاوز 5 ميغابايت";
    return null;
};

// Calls the account administration function (create teachers, employees, drivers, reset passwords).
export const adminAccounts = async (body) => {
    const { data, error } = await supabase.functions.invoke("admin-accounts", { body });

    if (error) {
        let code = "request_failed";
        try {
            code = (await error.context.json()).error || code;
        } catch {}
        throw new Error(code);
    }

    return data;
};

// Calls a database function and throws an Error whose message is the function's error code.
export const rpc = async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
};

// Arabic message for the errors raised by the enrollment functions, or null when unknown.
export const enrollErrorMessage = (e, year) => {
    const code = e?.message || "";
    if (code.includes("NO_TEMPLATE")) return `لا يوجد قالب فواتير للسنة ${year} \n يرجى إنشاء القالب أولاً`;
    if (code.includes("GRADE_AMOUNT_NOT_FOUND")) return "لم يتم تحديد مبلغ هذا الصف في قالب الفواتير";
    if (code.includes("FORBIDDEN")) return "غير مصرح لك بهذه العملية";
    return null;
};

// PostgREST returns at most 1000 rows per request; read every page.
export const fetchAll = async (table, columns = "*", order = "id", filter) => {
    const rows = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
        let q = supabase.from(table).select(columns).order(order).range(from, from + pageSize - 1);
        if (filter) q = filter(q);

        const { data, error } = await q;

        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) break;
    }

    return rows;
};

const CACHE_KEYS = [
    "adminLoggedIn", "adminDahboardName", "adminSchoolID", "adminSchoolName",
    "schoolLogo", "schoolCountry", "adminRole",
];

export const clearSessionCache = () => CACHE_KEYS.forEach((k) => localStorage.removeItem(k));

// Fills the UI cache (school id, name, logo, country) from the signed-in profile; returns null without a school/team session.
export const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) return null;

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, name, school_id, is_banned")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile || profile.is_banned || !["school_admin", "team"].includes(profile.role)) return null;

    let school = null;

    if (profile.role === "school_admin" && profile.school_id) {
        const res = await supabase
            .from("schools")
            .select("id, name, country, logo_path")
            .eq("id", profile.school_id)
            .maybeSingle();
        school = res.data;
    }

    const isTeam = profile.role === "team";

    localStorage.setItem("adminLoggedIn", "true");
    localStorage.setItem("adminDahboardName", profile.name || "");
    localStorage.setItem("adminSchoolID", isTeam ? "ALL" : profile.school_id || "");
    localStorage.setItem("adminSchoolName", isTeam ? "Safe Team" : school?.name || "");
    localStorage.setItem("schoolLogo", isTeam ? "" : publicUrl("school-logos", school?.logo_path) || "");
    localStorage.setItem("schoolCountry", isTeam ? "iraq" : school?.country || "iraq");
    localStorage.setItem("adminRole", isTeam ? "safe_team" : "admin");

    return { profile, school, isTeam };
};
