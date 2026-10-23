// Read-only end-to-end source probe. Uses the environment's outbound HTTPS proxy.
// Never writes to Firebase, never invokes paid AI, never logs transcript text.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolveEpisode} from '../server/identity.js';
import {discoverTranscript} from '../server/transcript.js';
import {publicUrl} from '../server/net.js';
const exec=promisify(execFile);
const readSource=async url=>{publicUrl(url);const {stdout}=await exec('curl',['--fail','--silent','--show-error','--location','--max-redirs','5','--max-time','25','--max-filesize','8000000','--proto','=https','--proto-redir','=https',url],{maxBuffer:8_000_000});return {text:stdout,url,headers:{}};};
const readJson=async url=>JSON.parse((await readSource(url)).text);
export const cases=[
 {showId:'1128955736',episodeId:'1000797748298',guest:'Vincent Deluard'},
 {showId:'1727278168',episodeId:'1000796472885',guest:'Jensen Huang'},
 {showId:'1294461271',episodeId:'1000796803517',guest:'Amy Walter'},
 {showId:'1490296778',episodeId:'1000796973676',guest:'Paisley Nardini'},
];
await mkdir('/tmp/knowledge-vault-live',{recursive:true});
const results=await Promise.all(cases.map(async c=>{try{const episode=await resolveEpisode(`https://podcasts.apple.com/podcast/id${c.showId}?i=${c.episodeId}`,{readSource,readJson});const sources=await discoverTranscript(episode,{readSource});await writeFile(`/tmp/knowledge-vault-live/${c.episodeId}.json`,JSON.stringify({episode,...sources}));const out={...c,title:episode.title,publishedAt:episode.publishedAt,guestInPublisherMetadata:(episode.title+' '+episode.description).toLowerCase().includes(c.guest.toLowerCase()),identity:episode.identityBasis,publisher:episode.publisherUrl,audioAvailable:Boolean(episode.audioUrl),durationSeconds:episode.durationSeconds,transcript:sources.transcript?{words:sources.transcript.wordCount,completeness:sources.transcript.completeness,coverage:sources.transcript.coverage,source:sources.transcript.source}:null,attempts:sources.attempts};console.log(JSON.stringify(out));return out;}catch(e){const out={...c,error:e.code||e.message};console.log(JSON.stringify(out));return out;}}));
await writeFile('/tmp/knowledge-vault-live/results.json',JSON.stringify(results,null,2));
if(results.some(x=>x.error))process.exitCode=1;
