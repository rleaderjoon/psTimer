import * as https from 'https';
import * as http from 'http';

export function fetchProblemTitle(link: string): Promise<string | undefined> {
  const bojMatch = link.match(/acmicpc\.net\/problem\/(\d+)/);
  if (!bojMatch) return Promise.resolve(undefined);

  const url = `https://www.acmicpc.net/problem/${bojMatch[1]}`;
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; psTimer/2.0)' },
    }, (res: http.IncomingMessage) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        const m = data.match(/<span id="problem_title">([^<]+)<\/span>/);
        resolve(m ? m[1].trim() : undefined);
      });
    });
    req.on('error', () => resolve(undefined));
    req.setTimeout(8000, () => { req.destroy(); resolve(undefined); });
  });
}

export function extractProblemId(url: string): string | undefined {
  const m = url.match(/acmicpc\.net\/problem\/(\d+)/);
  return m ? m[1] : undefined;
}
