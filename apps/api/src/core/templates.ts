import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Loads documents from the repo's templates/ folder (owned by the domain lead) and fills {{placeholders}}.
 * Files are read on every call, so an edited template is picked up without restarting the API.
 * Every rendered document records the template version it came from.
 */

const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? fileURLToPath(new URL('../../../../templates/', import.meta.url));

const HEADER = /^<!--\s*template:\s*([\w-]+)\s*·\s*version\s+([\w.-]+).*?-->\s*/;

export interface Template {
  name: string;
  version: string;
  body: string;
}

export async function loadTemplate(name: string): Promise<Template> {
  const raw = await readFile(`${TEMPLATES_DIR}${name}.md`, 'utf8');
  const header = raw.match(HEADER);
  if (!header || header[1] !== name) throw new Error(`Template ${name}.md is missing its "<!-- template: ${name} · version X -->" header`);
  return { name, version: header[2], body: raw.slice(header[0].length).trim() };
}

/** Returns the text of one `## VARIANT: <name>` section (without its heading). */
export function selectVariant(body: string, variant: string): string {
  const parts = body.split(/^## VARIANT:\s*/m);
  const match = parts.slice(1).find((p) => p.startsWith(`${variant}\n`) || p.startsWith(`${variant}\r\n`));
  if (!match) throw new Error(`Template variant ${variant} not found`);
  return match.slice(variant.length).trim();
}

/** Fills every {{key}}. Throws on a missing value or a leftover placeholder, so nothing half-filled gets signed. */
export function renderTemplate(body: string, values: Record<string, string | number>): string {
  const out = body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`No value for template placeholder {{${key}}}`);
    return String(values[key]);
  });
  const leftover = out.match(/\{\{\w+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder ${leftover[0]}`);
  return out;
}

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
