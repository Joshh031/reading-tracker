import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch } from 'undici';
import { VaultError } from './errors.js';

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===100&&b>=64&&b<=127)||(a===198&&[18,19].includes(b)));
  }
  // Use public IPv4 only; excludes IPv4-mapped IPv6 and local/link-local ranges.
  return false;
}
export function publicUrl(value) {
  let url; try { url = new URL(value); } catch { throw new VaultError('INVALID_URL','A valid HTTPS URL is required.',400); }
  if (url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!url.hostname.includes('.')||/\.(?:localhost|local|internal)$/.test(url.hostname)||isIP(url.hostname.replace(/[\[\]]/g,''))) throw new VaultError('UNSAFE_URL','Only public HTTPS sources are supported.',400);
  return url;
}
export async function readSource(value, { maxBytes=8_000_000, timeout=20_000, method='GET', headers={}, body, redirects=5 }={}) {
  let url=publicUrl(value);
  const signal=AbortSignal.timeout(timeout);
  for (let i=0;i<=redirects;i++) {
    const addresses=await lookup(url.hostname,{all:true,family:4});
    if (!addresses.length||addresses.some(x=>!publicAddress(x.address))) throw new VaultError('UNSAFE_ADDRESS','Source does not resolve to a public address.',400);
    // Pin the address checked above to prevent DNS rebinding between validation and fetch.
    const dispatcher=new Agent({connect:{lookup(_host,options,callback){const a=addresses[0];callback(null,options.all?[a]:a.address,a.family);}}});
    try {
      const response=await fetch(url,{method,body,headers:{'user-agent':'KnowledgeVault/2.0 (+private podcast research)',...headers},signal,redirect:'manual',dispatcher});
      if ([301,302,303,307,308].includes(response.status)) {
        await response.body?.cancel();
        if (i===redirects) throw new VaultError('REDIRECT_LIMIT','Source redirected too many times.');
        const next=publicUrl(new URL(response.headers.get('location'),url).href);
        if(next.origin!==url.origin) headers={};
        if(method!=='GET'&&method!=='HEAD') throw new VaultError('UNSAFE_REDIRECT','Authenticated provider requests cannot redirect.');
        url=next;continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new VaultError('SOURCE_HTTP_'+response.status,'Source returned HTTP '+response.status,502,response.status===429||response.status>=500); }
      if (Number(response.headers.get('content-length')||0)>maxBytes) { await response.body?.cancel(); throw new VaultError('SOURCE_TOO_LARGE','Source exceeds the configured size limit.'); }
      const chunks=[]; let size=0;
      for await (const part of response.body||[]) { size+=part.length; if(size>maxBytes) throw new VaultError('SOURCE_TOO_LARGE','Source exceeds the configured size limit.'); chunks.push(part); }
      return {text:Buffer.concat(chunks).toString('utf8'),url:url.href,headers:Object.fromEntries(response.headers),bytes:size};
    } finally { await dispatcher.close(); }
  }
}
export async function readJson(url,options) { const response=await readSource(url,options); return JSON.parse(response.text); }
