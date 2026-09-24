import type { ReactNode } from 'react';

/**
 * Renders the small markdown subset our templates use (headings, paragraphs, numbered clauses, tables, blockquotes,
 * **bold**) straight to React elements. No HTML strings, so user-typed text in a document can't inject markup.
 */

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** A new clause ("5.1 …") or numbered item ("1. …") starts a new paragraph even without a blank line before it. */
const CLAUSE = /^\d+\.(\d+)?\s/;

export default function MarkdownDoc({ source }: { source: string }) {
  const lines = source.split('\n');
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = out.length;

    if (!line.trim()) {
      i++;
    } else if (line.startsWith('# ')) {
      out.push(<h1 key={key} className="mb-3 text-xl font-bold">{inline(line.slice(2))}</h1>);
      i++;
    } else if (line.startsWith('## ')) {
      out.push(<h2 key={key} className="mt-6 mb-2 text-base font-semibold text-slate-900">{inline(line.slice(3))}</h2>);
      i++;
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i].trim())) rows.push(splitRow(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={key} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>{head.map((c, j) => <th key={j} className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>{r.map((c, j) => <td key={j} className="border border-slate-200 px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      out.push(
        <blockquote key={key} className="my-3 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {inline(quote.join(' '))}
        </blockquote>,
      );
    } else {
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#|\||>)/.test(lines[i]) && !CLAUSE.test(lines[i])) para.push(lines[i++]);
      out.push(<p key={key} className="my-1.5 text-sm leading-relaxed">{inline(para.join(' '))}</p>);
    }
  }

  return <article className="text-slate-800">{out}</article>;
}
