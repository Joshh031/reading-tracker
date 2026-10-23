// Read-only, repeatable migration inventory. Accepts a previously exported
// Firestore REST document or a native Reading Tracker JSON backup. No network.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {appleIdentity} from '../server/identity.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/legacy-plan.mjs input.json output.json');
function decode(v){if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);if(v.integerValue!==undefined)return Number(v.integerValue);return v.stringValue??v.booleanValue??v.doubleValue??v.timestampValue??null;}
const bytes=await readFile(input),data=JSON.parse(bytes),original=data.fields?decode({mapValue:{fields:data.fields}}):data;
const identities=Object.entries(original.entries||{}).flatMap(([date,day])=>(day.podcastEntries||[]).map((record,index)=>{let canonicalKey;try{canonicalKey=appleIdentity(record.url).key;}catch{canonicalKey='legacy:'+createHash('sha256').update(JSON.stringify({date,index,record})).digest('hex');}return {date,index,canonicalKey,recordHash:createHash('sha256').update(JSON.stringify(record)).digest('hex')};}));
const unique=new Set(identities.map(x=>x.canonicalKey));
const plan={schemaVersion:1,mode:'read-only inventory; no migration performed',sourceHash:createHash('sha256').update(bytes).digest('hex'),original,counts:{days:Object.keys(original.entries||{}).length,podcastRecords:identities.length,uniqueEpisodes:unique.size,duplicateRecords:identities.length-unique.size,books:(original.library||[]).length},identities};
await writeFile(output,JSON.stringify(plan,null,2),{mode:0o600});console.log(JSON.stringify({counts:plan.counts,sourceHash:plan.sourceHash}));
