"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { field } from "@/lib/format";
import { PROJECT_STATUSES } from "@/lib/projects";

export async function setProjectStatus(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "id");
  const status = field(fd, "status");
  if (!id || !status || !(PROJECT_STATUSES as readonly string[]).includes(status)) return;
  await sb.from("projects").update({ status }).eq("id", id);
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function addPayment(_prev: unknown, fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "project_id");
  const amount = Number(field(fd, "amount") ?? "");
  const date = field(fd, "date");
  if (!id || !Number.isFinite(amount) || amount <= 0 || !date) return { error: "Add the date and amount received." };
  const { error } = await sb.from("client_payments").insert({ project_id: id, received_on: date, amount_eur: amount, reference: field(fd, "reference") });
  if (error) return { error: "The payment could not be saved." };
  revalidatePath(`/projects/${id}`);
  return { ok: "Payment recorded." };
}

export async function updateServiceNet(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "service_id");
  const pid = field(fd, "project_id");
  const net = Number(field(fd, "net") ?? "");
  if (!id || !pid || !Number.isFinite(net) || net < 0) return;
  await sb.from("project_service_costs").upsert({ service_id: id, net_eur: net });
  revalidatePath(`/projects/${pid}`);
}
