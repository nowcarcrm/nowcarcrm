import fs from "fs";
import path from "path";

const p = path.join(process.cwd(), "app/(admin)/leads/_components/LeadsCategoryPage.tsx");
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("  const handleDeliveryExcelDownload = useCallback");
const mid = s.indexOf("  const automation = useMemo", start);
if (start < 0 || mid < 0) throw new Error("start/mid not found");

const ko = {
  adminOnly: "\uAD00\uB9AC\uC790\uB9CC \uC5D1\uC2E4 \uB2E4\uC6B4\uB85C\uB4DC\uAC00 \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
  login: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
  done:
    "\uC778\uB3C4\uC644\uB8CC \uACE0\uAC1D \uC5D1\uC2E4 \uB2E4\uC6B4\uB85C\uB4DC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  sheet: "\uC644\uB8CC\uACE0\uAC1D",
};

const fixed = `  const handleDeliveryExcelDownload = useCallback(async () => {
    if (profile?.role !== "admin") {
      toast.error(${JSON.stringify(ko.adminOnly)});
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast.error(${JSON.stringify(ko.login)});
      return;
    }
    const res = await fetch("/api/admin/delivered-export-permission", {
      method: "POST",
      headers: { Authorization: \`Bearer \${token}\` },
    });
    if (!res.ok) {
      toast.error(${JSON.stringify(ko.adminOnly)});
      return;
    }
    const delivered = filtered.filter((l) => l.counselingStatus === "\uC778\uB3C4\uC644\uB8CC");
    const rows = delivered.map((l) => ({
      "\uACE0\uAC1D\uBA85": l.base.name,
      "\uC5F0\uB77D\uCC98": l.base.phone,
      "\uB2F4\uB2F9\uC790": l.base.ownerStaff,
      "\uCC28\uB7C9\uBA85": l.contract?.vehicleName || l.base.desiredVehicle,
      "\uACC4\uC57D\uC77C": formatDateOnlyForExcel(l.contract?.contractDate ?? ""),
      "\uC778\uB3C4\uC77C": formatDateOnlyForExcel(l.deliveredAt ?? l.exportProgress?.deliveredAt ?? ""),
      "\uBCF4\uC99D\uAE08": l.base.depositOrPrepaymentAmount || "",
      "\uACC4\uC57D\uAE30\uAC04": l.base.contractTerm || "",
    }));
    downloadXlsxRows(rows, ${JSON.stringify(ko.sheet)}, \`delivered_customers_\${todayYmdKst()}\`);
    toast.success(${JSON.stringify(ko.done)});
  }, [profile?.role, filtered]);

`;

s = s.slice(0, start) + fixed + s.slice(mid);

const fnStart = s.indexOf("  function handleDeliveryExcelDownload()");
const fnEnd = s.indexOf("  function commitLeads", fnStart);
if (fnStart < 0 || fnEnd < 0) throw new Error("duplicate fn not found");
s = s.slice(0, fnStart) + s.slice(fnEnd);

fs.writeFileSync(p, s);
console.log("patched", p);
