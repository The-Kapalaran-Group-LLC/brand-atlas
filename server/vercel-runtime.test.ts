import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('loads the deployed search functions as native Node ESM and handles requests before calling providers', () => {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'archaeologist-vercel-runtime-'));
  try {
    writeFileSync(path.join(outputRoot, 'package.json'), '{"type":"module"}');
    symlinkSync(path.resolve('node_modules'), path.join(outputRoot, 'node_modules'), 'dir');
    for (const file of [
      'api/search.ts', 'api/archaeologist/web-search.ts', 'api/reddit.ts',
      'lib/grounding.ts', 'lib/fetchSubredditQuotes.ts', 'server/archaeologist-web-search.ts',
    ]) {
      const outputFile = path.join(outputRoot, file.replace(/\.ts$/, '.js'));
      mkdirSync(path.dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText);
    }
    const script = `
      const search = (await import(${JSON.stringify(pathToFileURL(path.join(outputRoot, 'api/search.js')).href)})).default;
      const ask = (await import(${JSON.stringify(pathToFileURL(path.join(outputRoot, 'api/archaeologist/web-search.js')).href)})).default;
      const reddit = (await import(${JSON.stringify(pathToFileURL(path.join(outputRoot, 'api/reddit.js')).href)})).default;
      const statuses = [];
      const res = { status(code) { statuses.push(code); return this; }, json() {}, setHeader() {} };
      await search({ method: 'GET', query: {} }, res);
      await ask({ method: 'POST', body: { query: '' } }, res);
      await reddit({ method: 'GET', query: {} }, res);
      console.log(JSON.stringify(statuses));
    `;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000 });
    expect(JSON.parse(result.trim())).toEqual([400, 400, 400]);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});
