import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const release=path.resolve(root,'../releases');
function zipEntries(file){const buffer=fs.readFileSync(file);let end=buffer.length-22;while(end>=Math.max(0,buffer.length-65557)&&buffer.readUInt32LE(end)!==0x06054b50)end--;assert.ok(end>=0,'Zip directory missing');let offset=buffer.readUInt32LE(end+16);const count=buffer.readUInt16LE(end+10),entries=new Map();for(let i=0;i<count;i++){assert.equal(buffer.readUInt32LE(offset),0x02014b50);const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),size=buffer.readUInt32LE(offset+20),nameSize=buffer.readUInt16LE(offset+28),extraSize=buffer.readUInt16LE(offset+30),commentSize=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42),name=buffer.toString('utf8',offset+46,offset+46+nameSize);assert.equal(flags&1,0,'Encrypted entry not expected');const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),compressed=buffer.subarray(start,start+size);const data=method===0?compressed:method===8?zlib.inflateRawSync(compressed):null;assert.ok(data,'Unsupported ZIP method');assert.ok(!entries.has(name),'Duplicate entry');entries.set(name,data);offset+=46+nameSize+extraSize+commentSize;}return entries;}
const apk=path.join(root,'dist/neichusi-android-'+version+'.apk'),apkEntries=zipEntries(apk);
for(const name of fs.readdirSync(path.join(root,'dist/web'))){assert.deepEqual(apkEntries.get('assets/'+name),fs.readFileSync(path.join(root,'dist/web',name)),name+' must match current build');}
for(const required of ['AndroidManifest.xml','classes.dex','resources.arsc'])assert.ok(apkEntries.has(required),required);
assert.ok(!Array.from(apkEntries.keys()).some(name=>/\.(jks|keystore|wxml|wxss)$/.test(name)));
const source=path.join(release,'neichusi-android-'+version+'-source.zip'),sourceEntries=zipEntries(source);
for(const name of sourceEntries.keys()){assert.ok(!/(^|\/)(signing|\.tools|node_modules|wechat-miniprogram|\.git)(\/|$)/.test(name),name);assert.ok(!/project\.(private\.)?config\.json$|\.(jks|keystore|apk|wxml|wxss)$/.test(name),name);}
fs.copyFileSync(apk,path.join(release,'neichusi-android-'+version+'.apk'));
const records=['neichusi-android-'+version+'.apk','neichusi-android-'+version+'-source.zip'].map(name=>{const data=fs.readFileSync(path.join(release,name));return {file:name,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};});
fs.writeFileSync(path.join(release,'neichusi-android-'+version+'-checksums.json'),JSON.stringify({version,baseline:JSON.parse(fs.readFileSync(path.join(root,'baseline.json'),'utf8')).version,applicationId:'cn.neichusi.app',minimumAndroidApi:26,signingCertificateSha256:'66d596e5dfc2a6358d212304db1229c620c95e3478ad9f0fd83533b9a8630096',apkAssetsVerified:true,sourceFiles:sourceEntries.size,files:records},null,2)+'\n');
console.log(JSON.stringify({apkEntries:apkEntries.size,sourceEntries:sourceEntries.size,files:records},null,2));
