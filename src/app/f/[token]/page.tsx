import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { cleanFields } from "@/lib/forms";
import { FormView } from "@/components/form-view";

export const metadata: Metadata = { title: "Form" };

async function submit(token: string, answers: Record<string, string>) {
  "use server";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { error: "This form link is not valid." };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {}).slice(0, 60)) clean[String(k).slice(0, 300)] = String(v ?? "").slice(0, 4000);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("submit_form", { p_token: token, p_answers: clean });
  return error ? { error: "This form is closed or could not be sent. Please contact Sensus." } : {};
}

/** Public, branded form. Reads only the form's name and questions through public_form(). */
export default async function PublicForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const sb = await supabaseServer();
  const { data } = await sb.rpc("public_form", { p_token: token });
  const form = data as { name: string; fields: unknown } | null;
  if (!form) {
    return <main className="pubwrap"><div className="panel pad" style={{ maxWidth: 520, margin: "0 auto" }}><h2>This form is closed</h2><p>Please contact Sensus Travel DMC at info@sensustravel.com.</p></div></main>;
  }
  return (
    <main className="pubwrap">
      <FormView name={form.name} fields={cleanFields(form.fields)} onSubmit={submit.bind(null, token)} />
    </main>
  );
}
