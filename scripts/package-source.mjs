import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const files=[];
for(const folder of ['client','native','scripts','tests','docs']){function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())walk(full);else files.push(path.relative(root,full).replaceAll('\\','/'));}}walk(path.join(root,folder));}
files.push('package.json','.gitignore','README.md','THIRD_PARTY_NOTICES.md','baseline.json','LICENSE');
if(files.some(file=>/^(signing|\.tools|node_modules|build|dist)\//.test(file)||/\.(jks|keystore|apk)$/.test(file)))throw Error('Private build files must not be packaged');
const release=path.resolve(root,'../releases');fs.mkdirSync(release,{recursive:true});
fs.mkdirSync(path.join(root,'build'),{recursive:true});
const listPath=path.join(root,'build/source-files.txt');fs.writeFileSync(listPath,files.join('\n'));
const destination=path.join(release,'neichusi-android-'+version+'-source.zip');
execFileSync('tar.exe',['-a','-c','-f',destination,'-T',listPath],{cwd:root,stdio:'inherit'});
console.log('Android-only source archive: '+destination+' ('+files.length+' files; no signing, personal data or WeChat project)');
