import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'node:crypto';
import { VaultError } from './errors.js';

export function adminApp() {
  if(getApps().length)return getApps()[0];
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp(raw?{credential:cert(JSON.parse(raw))}:{projectId:process.env.FIREBASE_PROJECT_ID||'familyhub-d72f8'});
}
export function rootCollection() {
  // Fail closed. Preview cannot name a production collection, even by env mistake.
  if(process.env.VERCEL_ENV==='production') {
    if(process.env.KV_PRODUCTION_ENABLED!=='true') throw new VaultError('PRODUCTION_DISABLED','Knowledge Vault production writes have not been enabled.',503);
    return 'knowledgeVaultUsers';
  }
  return 'knowledgeVaultPreviewUsers';
}
export function firestoreStore() {
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON&&!process.env.FIRESTORE_EMULATOR_HOST)throw new VaultError('STORAGE_NOT_CONFIGURED','Secure Firebase server credentials are required before saving.',503);
  if(process.env.KV_STORAGE_RULES_VERIFIED!=='true'&&!process.env.FIRESTORE_EMULATOR_HOST)throw new VaultError('STORAGE_RULES_UNVERIFIED','Private archive security rules must be verified before enabling storage.',503);
  const db=getFirestore(adminApp());const root=rootCollection();
  const owner=uid=>db.collection(root).doc(uid);
  const ref=(uid,id)=>owner(uid).collection('episodes').doc(id);
  return {
    async get(uid,id){const snap=await ref(uid,id).get();return snap.exists?snap.data():null;},
    async create(uid,id,data){try{await ref(uid,id).create(data);return {created:true,episode:data};}catch(e){if(e.code===6)return {created:false,episode:await this.get(uid,id)};throw e;}},
    async update(uid,id,patch){await ref(uid,id).update({...patch,updatedAt:new Date().toISOString()});return this.get(uid,id);},
    async list(uid){const all=[];let last=null;for(;;){let q=owner(uid).collection('episodes').orderBy('createdAt','desc').limit(200);if(last)q=q.startAfter(last);const snap=await q.get();all.push(...snap.docs.map(x=>x.data()));if(snap.size<200)break;last=snap.docs.at(-1);}return all;},
    async acquire(uid,id){return db.runTransaction(async tx=>{const r=ref(uid,id),snap=await tx.get(r);if(!snap.exists)throw new VaultError('NOT_FOUND','Episode not found.',404);const data=snap.data();if(data.leaseUntil>Date.now())return null;const lease=randomUUID();tx.update(r,{lease,leaseUntil:Date.now()+240_000});return {...data,lease};});},
    async release(uid,id,lease,patch){return db.runTransaction(async tx=>{const r=ref(uid,id),snap=await tx.get(r);if(snap.data()?.lease!==lease)throw new VaultError('LEASE_LOST','Another worker owns this episode.',409);tx.update(r,{...patch,lease:null,leaseUntil:0,updatedAt:new Date().toISOString()});});},
    async saveTranscript(uid,id,transcript){
      const chunks=[];let bucket=[];let size=0;
      for(const segment of transcript.segments){const n=Buffer.byteLength(JSON.stringify(segment));if(size+n>300_000){chunks.push(bucket);bucket=[];size=0;}bucket.push(segment);size+=n;}if(bucket.length)chunks.push(bucket);
      const batch=db.batch();chunks.forEach((segments,i)=>batch.set(ref(uid,id).collection('transcripts').doc(`${transcript.hash}-${i}`),{segments}));await batch.commit();
      const {segments,...meta}=transcript;return {...meta,chunks:chunks.length};
    },
    async transcript(uid,id,meta){if(!meta)return null;const snaps=await Promise.all(Array.from({length:meta.chunks},(_,i)=>ref(uid,id).collection('transcripts').doc(`${meta.hash}-${i}`).get()));if(snaps.some(s=>!s.exists))throw new VaultError('TRANSCRIPT_INCOMPLETE','Stored transcript chunks are missing.',500);return {...meta,segments:snaps.flatMap(s=>s.data().segments)};},
    async budget(uid,kind,limit){const date=new Date().toISOString().slice(0,10),r=owner(uid).collection('usage').doc(date);await db.runTransaction(async tx=>{const s=await tx.get(r),n=s.data()?.[kind]||0;if(n>=limit)throw new VaultError('DAILY_LIMIT','Daily processing limit reached. Try again tomorrow.',429);tx.set(r,{[kind]:n+1},{merge:true});});},
    async saveReflection(uid,id,reflection,expectedVersion){return db.runTransaction(async tx=>{const r=ref(uid,id),s=await tx.get(r);if(!s.exists)throw new VaultError('NOT_FOUND','Episode not found.',404);const current=s.data().reflection||{version:0};if(current.version!==expectedVersion)throw new VaultError('REFLECTION_CONFLICT','This reflection changed on another device. Reload before saving.',409);const next={...reflection,version:current.version+1,updatedAt:new Date().toISOString()};tx.set(r.collection('reflections').doc(String(next.version)),next);tx.update(r,{reflection:next});return next;});},
    async legacy(uid){if(uid!==process.env.KV_LEGACY_OWNER_UID)return null;const s=await db.collection('readingTracker').doc('joshh031').get();return s.exists?s.data():null;},
    async syncDaily(uid,id,date){
      if(process.env.VERCEL_ENV!=='production'||process.env.KV_DAILY_TRACKER_ENABLED!=='true')return {status:'preview_disabled'};
      if(uid!==process.env.KV_LEGACY_OWNER_UID)throw new VaultError('DAILY_TRACKER_NOT_LINKED','Daily Tracker is not linked for this account.',403);
      const dayRef=db.collection('dailyTracker').doc('joshh031'),marker=owner(uid).collection('listeningDays').doc(date);
      await db.runTransaction(async tx=>{const [d,m,legacy]=await Promise.all([tx.get(dayRef),tx.get(marker),tx.get(db.collection('readingTracker').doc('joshh031'))]);
        const keys=new Set(m.data()?.episodeIds||[]);keys.add(id);
        const legacyKeys=(legacy.data()?.entries?.[date]?.podcastEntries||[]).filter(p=>p.podcast).map(p=>{try{const i=new URL(p.url).searchParams.get('i');return i?'apple-'+i:'legacy-'+createHash('sha256').update(JSON.stringify(p)).digest('hex')}catch{return 'legacy-'+createHash('sha256').update(JSON.stringify(p)).digest('hex')}});legacyKeys.forEach(k=>keys.add(k));
        const points=Math.max(Number(d.data()?.entries?.[date]?.podcast||0),Math.min(3,keys.size)*5);
        tx.set(marker,{episodeIds:[...keys]},{merge:true});tx.set(dayRef,{entries:{[date]:{podcast:points}}},{merge:true});
      });return {status:'synced'};
    },
  };
}
