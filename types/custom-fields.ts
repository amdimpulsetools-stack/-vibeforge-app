export type CustomFieldEntity = "appointment" | "patient";

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

export interface CustomFieldDefinition {
  id: string;
  organization_id: string;
  entity_type: CustomFieldEntity;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[];
  placeholder: string | null;
  help_text: string | null;
  required: boolean;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type CustomFieldValue = string | number | boolean | null;
export type CustomFieldValues = Record<string, CustomFieldValue>;
