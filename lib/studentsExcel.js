// Excel template and parsing for importing many students at once.
// Students are created through the same create_student database function as the single-student form.

export const DATA_SHEET = "بيانات الطلاب";
export const REFERENCE_SHEET = "الصفوف الموجودة";
export const MAX_ROWS = 500;

export const COLUMNS = [
  { key: "name", title: "اسم الطالب", required: true, width: 30 },
  { key: "sex", title: "الجنس", required: true, width: 12 },
  { key: "birth_day", title: "يوم الميلاد", required: true, width: 12 },
  { key: "birth_month", title: "شهر الميلاد", required: true, width: 12 },
  { key: "birth_year", title: "سنة الميلاد", required: true, width: 12 },
  { key: "parent_name", title: "اسم ولي الأمر", required: true, width: 30 },
  { key: "phone", title: "رقم هاتف ولي الأمر", required: true, width: 22 },
  { key: "education_level", title: "المرحلة الدراسية", required: true, width: 18 },
  { key: "grade", title: "الصف الدراسي", required: true, width: 20 },
  { key: "specialization", title: "التخصص", required: false, width: 14 },
  { key: "section", title: "الشعبة", required: true, width: 12 },
];

const DIGITS_AR = "٠١٢٣٤٥٦٧٨٩";
const DIGITS_FA = "۰۱۲۳۴۵۶۷۸۹";

// Same text compares equal whatever hamza, ta marbuta, diacritics, digits script or spacing the file used
export const norm = (value) =>
  String(value ?? "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => DIGITS_AR.indexOf(d))
    .replace(/[۰-۹]/g, (d) => DIGITS_FA.indexOf(d))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const digitsOnly = (value) => norm(value).replace(/\D/g, "");

// Returns +9647XXXXXXXXX / +216XXXXXXXX, or null when the number is not valid for the school's country
export function normalizePhone(raw, country) {
  let d = digitsOnly(raw);
  if (country === "tunisia") {
    d = d.replace(/^00216/, "").replace(/^216/, "");
    return /^[259]\d{7}$/.test(d) ? `+216${d}` : null;
  }
  d = d.replace(/^00964/, "").replace(/^964/, "").replace(/^0/, "");
  return /^7\d{9}$/.test(d) ? `+964${d}` : null;
}

const parseSex = (raw) => {
  const s = norm(raw);
  if (["ذكر", "male", "m", "ولد"].includes(s)) return "male";
  if (["انثي", "انثى", "female", "f", "بنت"].includes(s)) return "female";
  return null;
};

function parseBirth(day, month, year) {
  const d = Number(norm(day));
  const m = Number(norm(month));
  const y = Number(norm(year));
  if (![d, m, y].every(Number.isInteger)) return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!valid || y < 1990 || date.getTime() > Date.now()) return null;

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const cellText = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    return "";
  }
  return String(v).trim();
};

const loadExcel = async () => {
  const mod = await import("exceljs");
  return mod.default || mod;
};

const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// Builds the template with the school's real stages, grades and classes so the dropdowns only offer valid values
export async function buildTemplate({ classes, country }) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Safe School";

  const sheet = workbook.addWorksheet(DATA_SHEET, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }],
  });

  sheet.mergeCells(1, 1, 1, COLUMNS.length);
  const title = sheet.getCell(1, 1);
  title.value = "قالب إدخال بيانات الطلاب";
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = fill("FFB8860B");
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 32;

  sheet.mergeCells(2, 1, 2, COLUMNS.length);
  const notice = sheet.getCell(2, 1);
  notice.value = "اكتب كل طالب في سطر. الأعمدة الحمراء مطلوبة. لا تغيّر أسماء الأعمدة. قيم الصف والشعبة يجب أن تطابق الصفوف الموجودة في ورقة «الصفوف الموجودة».";
  notice.font = { bold: true, color: { argb: "FF7A2E0E" } };
  notice.fill = fill("FFFFF1D6");
  notice.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 40;

  COLUMNS.forEach((col, i) => {
    const cell = sheet.getCell(3, i + 1);
    cell.value = `${col.title}${col.required ? " *" : ""}`;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(col.required ? "FFB42318" : "FF2563A7");
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sheet.getColumn(i + 1).width = col.width;
  });
  sheet.getRow(3).height = 30;

  // Reference sheet: the classes of this school and the dropdown lists
  const ref = workbook.addWorksheet(REFERENCE_SHEET, { views: [{ rightToLeft: true }] });
  ref.columns = [
    { width: 18 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 28 }, { width: 4 }, { width: 18 }, { width: 22 },
  ];
  ref.addRow(["المرحلة", "الصف", "التخصص", "الشعبة", "اسم الصف", "", "قائمة المراحل", "قائمة الصفوف"]);
  ref.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF344054");
    c.alignment = { horizontal: "center" };
  });

  classes.forEach((c, i) => {
    ref.getCell(i + 2, 1).value = c.education_level || c.educationLevel || "";
    ref.getCell(i + 2, 2).value = c.grade || "";
    ref.getCell(i + 2, 3).value = c.specialization || "";
    ref.getCell(i + 2, 4).value = c.section || "";
    ref.getCell(i + 2, 5).value = c.name || "";
  });

  const levels = [...new Set(classes.map((c) => c.education_level || c.educationLevel).filter(Boolean))];
  const grades = [...new Set(classes.map((c) => c.grade).filter(Boolean))];
  levels.forEach((v, i) => { ref.getCell(i + 2, 7).value = v; });
  grades.forEach((v, i) => { ref.getCell(i + 2, 8).value = v; });

  const last = MAX_ROWS + 3;
  const refName = `'${REFERENCE_SHEET}'`;
  const colIndex = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i + 1]));

  for (let row = 4; row <= last; row += 1) {
    sheet.getCell(row, colIndex.sex).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"ذكر,أنثى"'], showErrorMessage: true,
      errorTitle: "قيمة غير صحيحة", error: "اختر ذكر أو أنثى.",
    };
    sheet.getCell(row, colIndex.birth_day).dataValidation = {
      type: "whole", operator: "between", allowBlank: true, formulae: [1, 31], showErrorMessage: true, error: "اليوم بين 1 و31.",
    };
    sheet.getCell(row, colIndex.birth_month).dataValidation = {
      type: "whole", operator: "between", allowBlank: true, formulae: [1, 12], showErrorMessage: true, error: "الشهر بين 1 و12.",
    };
    sheet.getCell(row, colIndex.birth_year).dataValidation = {
      type: "whole", operator: "between", allowBlank: true, formulae: [1990, new Date().getFullYear()], showErrorMessage: true, error: "أدخل سنة ميلادية صحيحة.",
    };
    if (levels.length) {
      sheet.getCell(row, colIndex.education_level).dataValidation = {
        type: "list", allowBlank: true, formulae: [`${refName}!$G$2:$G$${levels.length + 1}`], showErrorMessage: true, error: "اختر مرحلة من القائمة.",
      };
    }
    if (grades.length) {
      sheet.getCell(row, colIndex.grade).dataValidation = {
        type: "list", allowBlank: true, formulae: [`${refName}!$H$2:$H$${grades.length + 1}`], showErrorMessage: true, error: "اختر صفاً من القائمة.",
      };
    }
    // Phone and section stay text so Excel never drops a leading zero or turns "1" into a number format
    sheet.getCell(row, colIndex.phone).numFmt = "@";
    sheet.getCell(row, colIndex.section).numFmt = "@";
  }

  const guide = workbook.addWorksheet("التعليمات", { views: [{ rightToLeft: true }] });
  guide.columns = [{ width: 26 }, { width: 95 }];
  guide.addRow(["العمود", "طريقة التعبئة"]);
  guide.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF344054");
  });
  const phoneHelp = country === "tunisia"
    ? "8 أرقام تبدأ بـ 2 أو 5 أو 9 (يقبل +216 قبلها)."
    : "10 أرقام تبدأ بـ 7، يقبل كتابتها مع 0 أو +964 في بدايتها.";
  [
    ["اسم الطالب", "مطلوب. الاسم الكامل للطالب."],
    ["الجنس", "مطلوب. ذكر أو أنثى."],
    ["يوم / شهر / سنة الميلاد", "مطلوبة. ثلاثة أعمدة منفصلة، مثل 10 و4 و2014."],
    ["اسم ولي الأمر", "مطلوب. الاسم الكامل لولي الأمر."],
    ["رقم هاتف ولي الأمر", `مطلوب. ${phoneHelp} يُستخدم لربط الطالب بحساب ولي الأمر.`],
    ["المرحلة / الصف / الشعبة", "مطلوبة. يجب أن تطابق صفاً موجوداً في ورقة «الصفوف الموجودة»، مثل: متوسط، أول متوسط، أ."],
    ["التخصص", "اختياري. يُكتب فقط إذا كان الصف له تخصص (مثل علمي أو أدبي)."],
    ["السنة الدراسية", "تُختار في لوحة التحكم عند رفع الملف، وليست عموداً في القالب."],
    ["مثال", "علي محمد حسن | ذكر | 10 | 4 | 2014 | محمد علي حسن | 7712345678 | متوسط | أول متوسط | | أ"],
    ["ملاحظات", "الحد الأقصى 500 طالب في الملف الواحد. الطلاب المكررون (نفس الاسم ونفس رقم الهاتف) يُتخطّون."],
  ].forEach((r) => guide.addRow(r));
  guide.eachRow((row, n) => { if (n > 1) row.alignment = { vertical: "top", wrapText: true }; });

  return workbook.xlsx.writeBuffer();
}

// Reads the filled template and returns raw text per row, found by column title so column order does not matter
export async function readWorkbook(arrayBuffer) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheet = workbook.getWorksheet(DATA_SHEET) || workbook.worksheets[0];
  if (!sheet) return { error: "الملف لا يحتوي أي ورقة" };

  let headerRow = null;
  const wanted = Object.fromEntries(COLUMNS.map((c) => [norm(c.title), c.key]));

  for (let r = 1; r <= Math.min(sheet.rowCount, 15) && !headerRow; r += 1) {
    const map = {};
    sheet.getRow(r).eachCell((cell, col) => {
      const key = wanted[norm(cellText(cell.value).replace(/\*/g, ""))];
      if (key) map[key] = col;
    });
    if (map.name && map.phone) headerRow = { index: r, map };
  }

  if (!headerRow) return { error: "لم أجد أعمدة القالب. استخدم القالب الذي تم تنزيله من هذه الصفحة ولا تغيّر أسماء الأعمدة." };

  const missing = COLUMNS.filter((c) => c.required && !headerRow.map[c.key]).map((c) => c.title);
  if (missing.length) return { error: `أعمدة ناقصة في الملف: ${missing.join("، ")}` };

  const rows = [];
  for (let r = headerRow.index + 1; r <= sheet.rowCount; r += 1) {
    const raw = {};
    let any = false;
    COLUMNS.forEach((c) => {
      const col = headerRow.map[c.key];
      raw[c.key] = col ? cellText(sheet.getRow(r).getCell(col).value) : "";
      if (raw[c.key]) any = true;
    });
    if (any) rows.push({ rowNumber: r, raw });
  }

  if (!rows.length) return { error: "الملف لا يحتوي أي طالب" };
  if (rows.length > MAX_ROWS) return { error: `الحد الأقصى ${MAX_ROWS} طالب في الملف الواحد، وملفك فيه ${rows.length}` };

  return { rows };
}

// Explains which part of the class columns does not match, so the school knows what to fix in the file
function classMismatchReason(classes, raw) {
  const grade = norm(raw.grade);
  const sameGrade = classes.filter((c) => norm(c.grade) === grade);

  if (!sameGrade.length) return `الصف «${raw.grade}» غير موجود في المدرسة`;

  const level = norm(raw.education_level);
  if (level && !sameGrade.some((c) => norm(c.education_level || c.educationLevel) === level)) {
    const actual = [...new Set(sameGrade.map((c) => c.education_level || c.educationLevel))].join("، ");
    return `المرحلة «${raw.education_level}» لا تطابق الصف «${raw.grade}» (مرحلته: ${actual})`;
  }

  const sameSection = sameGrade.filter((c) => norm(c.section) === norm(raw.section));
  if (sameSection.length) {
    const specs = [...new Set(sameSection.map((c) => c.specialization || "بدون تخصص"))].join("، ");
    return `التخصص «${raw.specialization || "فارغ"}» غير صحيح لهذا الصف (الموجود: ${specs})`;
  }

  const sections = [...new Set(sameGrade.map((c) => c.section || "بدون شعبة"))].join("، ");
  return `الشعبة «${raw.section}» غير موجودة في ${raw.grade} (الشعب الموجودة: ${sections})`;
}

// Checks every row against the school's classes and existing students; nothing is written here
export function validateRows(rows, { classes, existingStudents, country }) {
  const existing = new Set(
    existingStudents
      .filter((s) => !s.account_deleted)
      .map((s) => `${norm(s.name)}|${digitsOnly(s.phone_number)}`)
  );
  const seen = new Map();

  return rows.map(({ rowNumber, raw }) => {
    const errors = [];

    const name = raw.name.replace(/\s+/g, " ").trim();
    const parentName = raw.parent_name.replace(/\s+/g, " ").trim();
    if (!name) errors.push("اسم الطالب فارغ");
    if (!parentName) errors.push("اسم ولي الأمر فارغ");

    const sex = parseSex(raw.sex);
    if (!sex) errors.push("الجنس يجب أن يكون ذكر أو أنثى");

    const birth = parseBirth(raw.birth_day, raw.birth_month, raw.birth_year);
    if (!birth) errors.push("تاريخ الميلاد غير صحيح");

    const phone = normalizePhone(raw.phone, country);
    if (!phone) errors.push("رقم الهاتف غير صحيح");

    const grade = norm(raw.grade);
    const section = norm(raw.section);
    const level = norm(raw.education_level);
    const specialization = norm(raw.specialization);
    let klass = null;

    if (!grade) {
      errors.push("الصف الدراسي فارغ");
    } else {
      let found = classes.filter((c) => norm(c.grade) === grade && norm(c.section) === section);
      if (level) found = found.filter((c) => norm(c.education_level || c.educationLevel) === level);
      if (specialization) found = found.filter((c) => norm(c.specialization) === specialization);

      if (found.length === 1) klass = found[0];
      else if (found.length === 0) errors.push(classMismatchReason(classes, raw));
      else errors.push("أكثر من صف يطابق البيانات، أضف المرحلة أو التخصص");
    }

    let status = errors.length ? "error" : "ok";
    let note = errors.join("، ");

    if (!errors.length) {
      const key = `${norm(name)}|${digitsOnly(phone)}`;
      if (existing.has(key)) {
        status = "duplicate";
        note = "الطالب موجود مسبقاً في المدرسة";
      } else if (seen.has(key)) {
        status = "duplicate";
        note = `مكرر داخل الملف (السطر ${seen.get(key)})`;
      } else {
        seen.set(key, rowNumber);
      }
    }

    return {
      rowNumber,
      status,
      note,
      data: { name, parent_name: parentName, phone, sex, birth, class_id: klass?.id || null, class_name: klass?.name || "" },
    };
  });
}

// Excel report of an import: one line per file row, with the new student's code for parents to link with
export async function buildReport(results) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("نتيجة الاستيراد", { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: "السطر", width: 8 },
    { header: "اسم الطالب", width: 30 },
    { header: "اسم ولي الأمر", width: 30 },
    { header: "رقم الهاتف", width: 18 },
    { header: "الصف", width: 24 },
    { header: "الحالة", width: 14 },
    { header: "ملاحظة", width: 40 },
    { header: "كود الطالب", width: 26 },
  ];
  sheet.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF344054");
  });

  const label = { created: "تم", failed: "فشل", error: "خطأ", duplicate: "تخطّي" };
  results.forEach((r) => {
    sheet.addRow([
      r.rowNumber, r.data.name, r.data.parent_name, r.data.phone || "", r.data.class_name,
      label[r.status] || r.status, r.note || "", r.studentId || "",
    ]);
  });
  sheet.getColumn(4).numFmt = "@";

  return workbook.xlsx.writeBuffer();
}

export function downloadBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
