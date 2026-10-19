import Link from "next/link";
import { requireStaff, initialsOf } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { Nav } from "./nav";

const ROLE_LABEL = { admin: "Admin", sales: "Sales", operations: "Operations", finance: "Finance", client: "Client" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <div className="app">
      <aside className="rail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" alt="sensus" src="/brand/wordmark-white.png" />
        <Nav role={profile.role} />
        <div className="user">
          <div className="avatar">{profile.initials || initialsOf(profile.full_name) || "?"}</div>
          <div style={{ minWidth: 0 }}>
            <div>{profile.full_name}</div>
            <div style={{ color: "#8E8D82", fontSize: 12 }}>{ROLE_LABEL[profile.role]} · <Link href="/set-password" style={{ color: "#8E8D82" }}>Change password</Link></div>
          </div>
          <form action={signOut} style={{ marginLeft: "auto" }}>
            <button className="btn sm ghost" style={{ color: "#D9D8CF" }}>Sign out</button>
          </form>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
