export interface CueFields {
  label: string;
  note: string | null;
  values: Record<string, string>;
}

export interface DraftCommitId {
  stream: string;
  revision: number;
}

export interface DraftCommit {
  cueId: string;
  revision: number;
  text: CueFields;
  submitted: CueFields;
}

export function isCueDraftFields(value: unknown): value is CueFields {
  if (!value || typeof value !== 'object') return false;
  const { label, note, values } = value as Partial<CueFields>;
  return typeof label === 'string' && (note === null || typeof note === 'string')
    && !!values && typeof values === 'object' && !Array.isArray(values)
    && Object.values(values).every(field => typeof field === 'string');
}

/** A newer edit inherits accepted fields unless the operator changed them again. */
export function followCueCommit(fields: CueFields, submitted: CueFields, text: CueFields): CueFields {
  const values = { ...text.values };
  for (const [field, value] of Object.entries(fields.values)) {
    if (submitted.values[field] !== value) values[field] = value;
  }
  return {
    label: fields.label === submitted.label ? text.label : fields.label,
    note: fields.note === submitted.note ? text.note : fields.note,
    values,
  };
}
