export interface TemplateVariables {
  name?: string;
  medication_name?: string;
  dosage?: string;
  unit?: string;
  token?: string;
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
  }

  return result;
}
