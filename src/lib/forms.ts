export type FieldType = "short" | "long" | "email" | "number" | "date" | "choice" | "rating";
export type FormField = { id: string; label: string; type: FieldType; required: boolean; options: string[] };

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "short", label: "Short text" },
  { value: "long", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "choice", label: "Choice" },
  { value: "rating", label: "Rating 1–5" },
];

const f = (label: string, type: FieldType, required = false, options: string[] = []): Omit<FormField, "id"> => ({ label, type, required, options });

export const TEMPLATES: Record<string, { name: string; fields: Omit<FormField, "id">[] }> = {
  registration: {
    name: "Participant registration",
    fields: [
      f("Full name (as in passport)", "short", true), f("Email", "email", true), f("Mobile phone", "short", true),
      f("Arrival flight and time", "short"), f("Departure flight and time", "short"),
      f("Room", "choice", true, ["Single", "Double", "Twin"]), f("Sharing with (if twin or double)", "short"),
      f("Dietary requirements", "choice", false, ["None", "Vegetarian", "Vegan", "Gluten-free", "Lactose-free", "Other"]),
      f("Allergies or other needs", "long"),
    ],
  },
  dietary: {
    name: "Dietary and mobility needs",
    fields: [f("Full name", "short", true), f("Dietary requirements or allergies", "long"), f("Mobility or accessibility needs", "long")],
  },
  feedback: {
    name: "Post-event feedback",
    fields: [f("Your name (optional)", "short"), f("Overall, how was the programme?", "rating", true), f("Best moment", "short"),
      f("What could be better?", "long"), f("Would you recommend Sensus?", "choice", true, ["Yes", "No"])],
  },
  leisure: {
    name: "Leisure trip brief",
    fields: [f("Your name", "short", true), f("Email", "email", true), f("Who is travelling?", "short", true), f("Travel dates", "short", true),
      f("Budget per person (EUR)", "number"), f("Interests", "choice", false, ["Food & wine", "Culture", "Beach", "Nature", "Wellness", "Adventure"]),
      f("Hotel style", "choice", false, ["Boutique", "Classic luxury", "Design", "Rural retreat"]), f("Anything else we should know?", "long")],
  },
  blank: { name: "New form", fields: [f("Full name", "short", true), f("Email", "email", true)] },
};

/** Cleans a field list coming from the browser. */
export function cleanFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const types = FIELD_TYPES.map((t) => t.value);
  return raw.slice(0, 60).map((x, i) => {
    const o = (x ?? {}) as Partial<FormField>;
    return {
      id: typeof o.id === "string" && /^[a-z0-9-]{1,40}$/i.test(o.id) ? o.id : `q${i + 1}`,
      label: String(o.label ?? "").slice(0, 300) || `Question ${i + 1}`,
      type: (types.includes(o.type as FieldType) ? o.type : "short") as FieldType,
      required: !!o.required,
      options: Array.isArray(o.options) ? o.options.map((s) => String(s).slice(0, 100)).filter(Boolean).slice(0, 30) : [],
    };
  });
}
