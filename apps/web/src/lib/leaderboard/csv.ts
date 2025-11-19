// Lightweight CSV fetch + parse (handles quoted fields and commas)

export async function fetchCsvText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch CSV: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    // Always push the row to preserve header/column count alignment
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        pushField();
        i++;
        continue;
      }
      if (ch === '\n') {
        pushField();
        pushRow();
        i++;
        continue;
      }
      if (ch === '\r') {
        // ignore \r (handle CRLF)
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }
  // flush last
  pushField();
  pushRow();

  // Drop leading/trailing empty rows robustly
  // Trim empty rows safely
  let head = rows[0];
  while (rows.length && Array.isArray(head) && head.every((s) => (s ?? "").trim() === "")) {
    rows.shift();
    head = rows[0];
  }
  let tail = rows[rows.length - 1];
  while (rows.length && Array.isArray(tail) && tail.every((s) => (s ?? "").trim() === "")) {
    rows.pop();
    tail = rows[rows.length - 1];
  }

  if (rows.length === 0) return [];
  const header = rows[0] ?? [];
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r] ?? [];
    const first = cols[0] ?? "";
    if (cols.length <= 1 && first.trim() === "") continue; // skip empty/blank line
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c]?.trim();
      if (!key) continue;
      obj[key] = cols[c] ?? "";
    }
    out.push(obj);
  }
  return out;
}
