// PDF handed to the family after a student registers: the student's details and the activation code.

// Images are inlined first so the PDF renderer never depends on cross-origin loading
const toDataUrl = async (url) => {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export async function downloadRegistrationPdf(record, { schoolName, schoolLogoUrl }) {
  // html2pdf touches `self` on import, so it can only load in the browser
  const html2pdf = (await import("html2pdf.js")).default;
  const [schoolLogo, safeLogo] = await Promise.all([toDataUrl(schoolLogoUrl), toDataUrl("/Logo.png")]);

  const el = (tag, style, text) => {
    const node = document.createElement(tag);
    Object.assign(node.style, style);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const logo = (src) => {
    const img = el("img", { width: "70px", height: "70px", objectFit: "contain" });
    img.src = src;
    return img;
  };

  const root = el("div", { direction: "rtl", width: "700px", background: "#fff", color: "#111827", fontFamily: "inherit", padding: "8px" });

  const top = el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" });
  top.appendChild(schoolLogo ? logo(schoolLogo) : el("div", { width: "70px" }));
  const heading = el("div", { textAlign: "center", flex: "1" });
  heading.appendChild(el("h2", { margin: "0 0 4px", fontSize: "18px" }, schoolName || ""));
  heading.appendChild(el("h3", { margin: "0", fontSize: "15px", color: "#8a6115" }, "استمارة تسجيل طالب"));
  top.appendChild(heading);
  top.appendChild(safeLogo ? logo(safeLogo) : el("div", { width: "70px" }));
  root.appendChild(top);

  const rows = [
    ["اسم الطالب", record.name],
    ["اسم ولي الأمر", record.parentName],
    ["رقم هاتف ولي الأمر", record.phone],
    ["المرحلة", record.educationLevel],
    ["الصف والشعبة", record.className],
    ["السنة الدراسية", record.year],
    ["اسم السائق", record.driverName],
    ["رقم السائق", record.driverPhone],
    ["صلة القرابة بالسائق", record.driverRelation],
  ];

  const table = el("table", { width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "16px" });
  rows.forEach(([label, value]) => {
    const tr = el("tr", {});
    tr.appendChild(el("th", { width: "34%", border: "1px solid #9ca3af", padding: "7px", background: "#f1f5f9", textAlign: "right" }, label));
    const td = el("td", { border: "1px solid #9ca3af", padding: "7px", textAlign: "right" }, String(value ?? ""));
    if (/^[+\d]/.test(String(value ?? ""))) td.style.direction = "ltr", td.style.textAlign = "right";
    tr.appendChild(td);
    table.appendChild(tr);
  });
  root.appendChild(table);

  const codeBox = el("div", { border: "2px dashed #8a6115", borderRadius: "10px", padding: "14px", textAlign: "center", background: "#fff8e6" });
  codeBox.appendChild(el("p", { margin: "0 0 8px", fontWeight: "bold", fontSize: "14px" }, "كود التفعيل"));
  codeBox.appendChild(el("p", { margin: "0 0 10px", fontSize: "17px", fontWeight: "bold", direction: "ltr", wordBreak: "break-all", letterSpacing: "0.5px" }, record.id));
  codeBox.appendChild(el("p", { margin: "0", fontSize: "12px", color: "#b91c1c", fontWeight: "bold", lineHeight: "1.8" },
    "مهم جداً: احتفظ بهذا الكود. تحتاجه لربط الطالب بحساب ولي الأمر في تطبيق Safe Student."));
  root.appendChild(codeBox);

  root.appendChild(el("p", { margin: "12px 0 0", fontSize: "11px", color: "#6b7280", textAlign: "center" },
    `تاريخ التسجيل: ${new Date(record.createdAt).toLocaleDateString("ar-IQ")}`));

  const holder = el("div", { position: "fixed", top: "0", left: "-10000px" });
  holder.appendChild(root);
  document.body.appendChild(holder);

  try {
    await html2pdf()
      .set({
        margin: 10,
        filename: `تسجيل-${record.name}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(root)
      .save();
  } finally {
    holder.remove();
  }
}
