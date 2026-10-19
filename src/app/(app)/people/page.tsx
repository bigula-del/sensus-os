import type { Metadata } from "next";
import { requireAdmin, initialsOf } from "@/lib/auth";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "People" };

type Staff = { id: string; full_name: string; role: string; city: string | null;
  hr_staff: { contract: string | null; start_date: string | null; pay: string | null; holiday_days_left: number | null } | null };
type Leave = { id: string; kind: string; starts_on: string; ends_on: string; days: number; status: string; profiles: { full_name: string } | null };

export default async function PeoplePage() {
  const { sb } = await requireAdmin();
  const [{ data: staff }, { data: leave }] = await Promise.all([
    sb.from("profiles").select("id, full_name, role, city, hr_staff(contract, start_date, pay, holiday_days_left)").neq("role", "client").order("full_name").returns<Staff[]>(),
    sb.from("hr_leave").select("id, kind, starts_on, ends_on, days, status, profiles(full_name)").order("starts_on", { ascending: false }).limit(20).returns<Leave[]>(),
  ]);
  return (
    <>
      <div className="head">
        <div><div className="chips"><span className="chip bad">Admin only</span></div><h1 style={{ marginTop: 8 }}>People</h1>
          <p className="sub">Contracts, pay and time off. Only you can open this page, and the database refuses these records to anyone else.</p></div>
      </div>
      <div className="panel tablewrap">
        <table className="t" style={{ minWidth: 720 }}>
          <thead><tr><th>Person</th><th>Role</th><th>Contract</th><th>Start date</th><th>Pay</th><th className="num">Holiday left</th></tr></thead>
          <tbody>
            {(staff ?? []).map((s) => (
              <tr key={s.id}>
                <td><span className="row" style={{ gap: 8 }}><span className="avatar sm alt">{initialsOf(s.full_name)}</span><b>{s.full_name}</b></span></td>
                <td style={{ textTransform: "capitalize" }}>{s.role}{s.city && <div className="note">{s.city}</div>}</td>
                <td>{s.hr_staff?.contract ?? "—"}</td>
                <td>{s.hr_staff?.start_date ? shortDate(s.hr_staff.start_date, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                <td>{s.hr_staff?.pay ?? "—"}</td>
                <td className="num">{s.hr_staff?.holiday_days_left != null ? `${s.hr_staff.holiday_days_left} days` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <header><h3>Time off</h3></header>
        {leave?.length ? leave.map((r) => (
          <div className="alert" key={r.id}><div style={{ flex: 1 }}><b>{r.profiles?.full_name}</b> · {r.kind}<div className="note">{shortDate(r.starts_on)} – {shortDate(r.ends_on)} · {r.days} days</div></div><span className="chip">{r.status}</span></div>
        )) : <div className="empty">No time-off requests yet.</div>}
      </section>
      <p className="note">Editing contracts, approving leave and HR documents come in a later build step.</p>
    </>
  );
}
