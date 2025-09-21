import fs from 'node:fs';
import path from 'node:path';

export interface GuidanceCitation { title: string; url?: string; quote: string }
export interface Guidance { bullets: string[]; citations: GuidanceCitation[] }

export function docsSearch(projectRoot: string, hint: string): Guidance | undefined {
  try {
    const p = path.join(projectRoot, '..', 'docs', 'MigrationGuide.md');
    const txt = fs.readFileSync(p, 'utf8');
    const key = /RouteComponentProps|withRouter|useHistory|useNavigate|useLocation|Switch|Redirect|Navigate/;
    const m = key.exec(hint) || key.exec(txt);
    const bullets: string[] = [];
    const citations: GuidanceCitation[] = [];
    if (m) {
      const idx = txt.indexOf(m[0]);
      const start = Math.max(0, idx - 600);
      const end = Math.min(txt.length, idx + 600);
      const excerpt = txt.slice(start, end);
      for (const sentence of excerpt.split(/[\.!?]\s+/).slice(0, 6)) {
        const s = sentence.trim();
        if (s.length > 20) bullets.push(s);
      }
      citations.push({ title: 'MigrationGuide.md', quote: excerpt.trim() });
      return { bullets, citations };
    }
  } catch {}
  return undefined;
}


