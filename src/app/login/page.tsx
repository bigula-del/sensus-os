import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "no-access": "This account does not have access to Sensus OS. Ask Matheus to check your role.",
  "link-expired": "That link has expired or was already used. Ask for a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="login">
      <LoginForm next={next} notice={error ? NOTICES[error] : undefined} />
    </main>
  );
}
