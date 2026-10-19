"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { field } from "@/lib/format";

export async function createSupplier(_prev: unknown, fd: FormData) {
  const { sb } = await requireStaff();
  const name = field(fd, "name");
  if (!name) return { error: "Add the supplier's name." };
  const rating = Number(field(fd, "rating") ?? "") || null;
  const { error } = await sb.from("suppliers").insert({
    name,
    category: field(fd, "category") ?? "Other",
    city: field(fd, "city"),
    country: field(fd, "country")?.toUpperCase() ?? null,
    email: field(fd, "email"),
    phone: field(fd, "phone"),
    payment_terms: field(fd, "payment_terms"),
    rating,
  });
  if (error) return { error: "The supplier could not be saved." };
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
