import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
let esbuild;try{esbuild=require('esbuild');}catch{esbuild=require(path.join(root,'../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild'));}
fs.mkdirSync(path.join(root,'dist/web'),{recursive:true});
await esbuild.build({entryPoints:[path.join(root,'client/main.jsx')],bundle:true,outfile:path.join(root,'dist/web/app.js'),platform:'browser',format:'iife',target:['chrome100'],minify:true,define:{'process.env.NODE_ENV':'"production"'},loader:{'.js':'jsx'}});
fs.copyFileSync(path.join(root,'client/index.html'),path.join(root,'dist/web/index.html'));
fs.copyFileSync(path.join(root,'client/app.css'),path.join(root,'dist/web/app.css'));
const reactDirectory=path.dirname(require.resolve('react/package.json'));
fs.writeFileSync(path.join(root,'dist/web/THIRD_PARTY_LICENSES.txt'),'React, React DOM and Scheduler\n\n'+fs.readFileSync(path.join(reactDirectory,'LICENSE'),'utf8'));
console.log('Offline Android client bundled.');
