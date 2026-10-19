import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { LeadForm } from "./lead-form";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await requireStaff();
  return (
    <>
      <div className="head"><div><h1>New lead</h1><p className="sub">A request from an agency, a company or a private client.</p></div></div>
      <LeadForm />
    </>
  );
}
