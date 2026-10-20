import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ProposalDoc, type ClientProposal } from "@/components/proposal-doc";

export const metadata: Metadata = { title: "Proposal" };

/**
 * The page a client opens from the proposal link. It reads ONLY through the
 * client_proposal() database function, which returns client-facing fields.
 * Net prices, actual costs, margins and suppliers cannot reach this page.
 */
export default async function PublicProposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const sb = await supabaseServer();
  const { data } = await sb.rpc("client_proposal", { p_token: token });
  const p = data as ClientProposal | null;
  if (!p) notFound();
  return (
    <main className="pubwrap">
      <ProposalDoc p={p} />
    </main>
  );
}
