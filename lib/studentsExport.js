// Export of the students list (name, parent, class, parent phone, activation code) to Excel and PDF.
import { downloadBuffer } from "./studentsExcel";

const BASE_HEADERS = ["م", "اسم الطالب", "اسم ولي الأمر", "الصف والشعبة", "رقم هاتف ولي الأمر", "كود التفعيل"];
const DRIVER_HEADERS = ["اسم السائق", "رقم السائق", "صلة القرابة بالسائق"];

// Driver columns hold what the family wrote in the registration form, so the school can build lines and drivers from them
const headersFor = (withDriver) => (withDriver ? [...BASE_HEADERS, ...DRIVER_HEADERS] : BASE_HEADERS);

const toCells = (rows, withDriver) =>
  rows.map((r, i) => {
    const base = [i + 1, r.name, r.parent_name, r.class_name, r.phone, r.code];
    return withDriver ? [...base, r.driver_name || "", r.driver_phone || "", r.driver_relation || ""] : base;
  });

export async function exportStudentsExcel(rows, { title, fileName, withDriver }) {
  const HEADERS = headersFor(withDriver);
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الطلاب", { views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }] });
  sheet.columns = [{ width: 6 }, { width: 30 }, { width: 30 }, { width: 24 }, { width: 22 }, { width: 42 }, ...(withDriver ? [{ width: 26 }, { width: 20 }, { width: 20 }] : [])];

  sheet.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8860B" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  const header = sheet.getRow(2);
  HEADERS.forEach((h, i) => {
    const c = header.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF344054" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });

  toCells(rows, withDriver).forEach((cells) => {
    const row = sheet.addRow(cells);
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(5).numFmt = "@";
    row.getCell(6).numFmt = "@";
    if (withDriver) row.getCell(8).numFmt = "@";
  });

  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: HEADERS.length } };

  downloadBuffer(await workbook.xlsx.writeBuffer(), `${fileName}.xlsx`);
}

export async function exportStudentsPdf(rows, { title, schoolName, fileName, withDriver }) {
  const HEADERS = headersFor(withDriver);
  // html2pdf touches `self` on import, so it can only load in the browser
  const html2pdf = (await import("html2pdf.js")).default;

  const el = (tag, style, text) => {
    const node = document.createElement(tag);
    Object.assign(node.style, style);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Explicit light colors so the file is the same whatever theme the dashboard is in
  const root = el("div", {
    direction: "rtl", width: withDriver ? "1050px" : "730px", background: "#fff", color: "#111827", fontFamily: "inherit", padding: "4px",
  });

  if (schoolName) root.appendChild(el("h2", { margin: "0 0 4px", textAlign: "center", fontSize: "18px" }, schoolName));
  root.appendChild(el("h3", { margin: "0 0 4px", textAlign: "center", fontSize: "15px", color: "#8a6115" }, title));
  root.appendChild(
    el("p", { margin: "0 0 12px", textAlign: "center", fontSize: "12px", color: "#6b7280" },
      `عدد الطلاب: ${rows.length} - ${new Date().toLocaleDateString("ar-IQ")}`)
  );

  const table = el("table", { width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "fixed" });
  const widths = withDriver ? ["4%", "14%", "14%", "11%", "10%", "23%", "10%", "8%", "6%"] : ["5%", "19%", "19%", "14%", "13%", "30%"];

  const cell = (tag, text, i, extra = {}) =>
    el(tag, {
      width: widths[i], border: "1px solid #9ca3af", padding: "5px 4px", textAlign: "center", overflow: "hidden", ...extra,
    }, String(text ?? ""));

  const head = el("tr", {});
  HEADERS.forEach((h, i) => head.appendChild(cell("th", h, i, { background: "#f1f5f9", fontWeight: "bold" })));
  table.appendChild(head);

  toCells(rows, withDriver).forEach((cells) => {
    const tr = el("tr", { pageBreakInside: "avoid" });
    cells.forEach((v, i) => {
      const ltr = i === 4 || i === 5 || (withDriver && i === 7);
      tr.appendChild(cell("td", v, i, ltr ? { direction: "ltr", fontSize: i === 5 ? "9px" : "10.5px" } : {}));
    });
    table.appendChild(tr);
  });
  root.appendChild(table);

  const holder = el("div", { position: "fixed", top: "0", left: "-10000px" });
  holder.appendChild(root);
  document.body.appendChild(holder);

  try {
    await html2pdf()
      .set({
        margin: 8,
        filename: `${fileName}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: withDriver ? "landscape" : "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: "tr" },
      })
      .from(root)
      .save();
  } finally {
    holder.remove();
  }
}
