/** Bounded signed background activity for an isolated rehearsal, never a capacity test. */
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,chmodSync,lstatSync,realpathSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {dirname,join,resolve,basename} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createBackendClient,BackendClientError,type BackendClient} from '../src/host/backend-client.ts'
import type {CommunityKeypair} from '../src/host/community-keys.ts'
import type {MarketState,MarketPositionRequest,MarketBatchId} from '../src/shared/market-v1.ts'
import type {V1VoteRequest} from '../src/shared/backend-v1.ts'
import {activityIntent,type ActivityPolicy} from './market-activity-policy.ts'
import {parseRehearsalClock,validateRehearsalEnvironment} from '../src/backend/rehearsal-safety.ts'

export interface MarketActivityOptions { mode: 'prepare'|'run'|'report'; stateDir: string; priorState: string; clockFile: string; maxDays?: number }
export function validateMarketActivityOptions(input: MarketActivityOptions): Required<MarketActivityOptions>&{databasePath:string} {
  const clockFile=resolve(input.clockFile),root=dirname(clockFile),databasePath=join(root,'liangxiang-rehearsal.sqlite')
  validateRehearsalEnvironment({LIANGXIANG_REHEARSAL:'1',LIANGXIANG_BACKEND_HOST:'127.0.0.1',LIANGXIANG_BACKEND_PORT:'4195',LIANGXIANG_ALLOW_UNSIGNED:'0',LIANGXIANG_BACKEND_DB:databasePath,LIANGXIANG_REHEARSAL_CLOCK_FILE:clockFile})
  parseRehearsalClock(JSON.parse(readFileSync(clockFile,'utf8')))
  const stateDir=resolve(input.stateDir),priorState=resolve(input.priorState),maxDays=input.maxDays??10
  if(!['prepare','run','report'].includes(input.mode)||!Number.isSafeInteger(maxDays)||maxDays<1||maxDays>10)throw Error('bounded_mode_and_day_limit_required')
  if(dirname(stateDir)!==root||dirname(dirname(priorState))!==root||dirname(priorState)===stateDir||basename(priorState)!=='state.json')throw Error('distinct_private_rehearsal_round_directories_required')
  for(const directory of [dirname(priorState),...(existsSync(stateDir)?[stateDir]:[])])if(!lstatSync(directory).isDirectory()||realpathSync(directory)!==directory)throw Error('regular_private_directory_required')
  for(const file of [priorState,...['state.json','background.json','live.json','report.json'].map(name=>join(stateDir,name)).filter(existsSync)])if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||lstatSync(file).nlink!==1)throw Error('regular_private_state_required')
  return {...input,stateDir,priorState,clockFile,maxDays,databasePath}
}
export function parseMarketActivityArguments(args: string[]): MarketActivityOptions {
  const values=new Map<string,string>()
  for(let i=0;i<args.length;i+=2){const name=args[i],value=args[i+1];if(!name||!['--mode','--state-dir','--prior-state','--clock-file','--max-days'].includes(name)||!value||values.has(name))throw Error('invalid_activity_arguments');values.set(name,value)}
  const mode=values.get('--mode')??'prepare',stateDir=values.get('--state-dir'),priorState=values.get('--prior-state'),clockFile=values.get('--clock-file')
  if(!stateDir||!priorState||!clockFile||!['prepare','run','report'].includes(mode))throw Error('explicit_private_paths_and_valid_mode_required')
  const maxDays=Number(values.get('--max-days')??10)
  if(!Number.isSafeInteger(maxDays)||maxDays<1||maxDays>10)throw Error('bounded_day_limit_required')
  return {mode:mode as MarketActivityOptions['mode'],stateDir,priorState,clockFile,maxDays}
}
export async function runMarketActivity(input: MarketActivityOptions): Promise<void> {
const options=validateMarketActivityOptions(input)
const directory=options.stateDir
const priorStatePath=options.priorState
const clockPath=options.clockFile
const statePath=directory+'/state.json', reportPath=directory+'/report.json'
const mode=options.mode
if(mode==='report'){console.log(readFileSync(reportPath,'utf8'));return}
mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700)
writeFileSync(join(directory,'.gitignore'),'*\n',{mode:0o600})
const atomic=(file:string,value:unknown)=>{const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});renameSync(temp,file)}
interface Actor{key:CommunityKeypair}
interface Day{date:string,market:string,events:Record<string,boolean>,opening:number[],spent:number[],minted:number[],closed?:boolean,receipts?:unknown[]}
interface State{actors:Actor[],days:Day[],intents:Record<string,any>,events:number,started:number|null,startBusiness:number|null,errors:Array<{at:number,operation:string,code:string}>,limitDays:number}
const prior=JSON.parse(readFileSync(priorStatePath,'utf8')) as State
if(prior.actors?.length!==12)throw Error('twelve_existing_test_identities_required')
const saved:State=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{actors:prior.actors,days:[],intents:{},events:0,started:null,startBusiness:null,errors:[],limitDays:options.maxDays}
if(saved.actors.length!==12||saved.actors.some((actor,i)=>actor.key.installationId!==prior.actors[i]!.key.installationId))throw Error('existing_test_identity_mismatch')
if(saved.limitDays!==options.maxDays)throw Error('saved_day_limit_must_not_change_on_resume')
const save=()=>atomic(statePath,saved)
save()
const clients=saved.actors.map(actor=>createBackendClient({baseUrl:'http://127.0.0.1:4195',timeoutMs:5000,signer:()=>actor.key}))
interface BackgroundState{policy:ActivityPolicy,pending:null|{actor:number,date:string,intent:V1VoteRequest},requests:number,incense:number,spent:Record<string,number[]>,rejections:number,unknown:number}
const backgroundPath=directory+'/background.json'
const background:BackgroundState=existsSync(backgroundPath)?JSON.parse(readFileSync(backgroundPath,'utf8')):{policy:{random:0x6d2b79f5,probability:0.5,target:0.5,regimeUntil:0,nextAt:0,cursor:0,actorDue:Array(12).fill(0)},pending:null,requests:0,incense:0,spent:{},rejections:0,unknown:0}
const saveBackground=()=>atomic(backgroundPath,background)
let available=Array(12).fill(0),backgroundMarket:MarketState|null=null,backgroundBusy:Promise<void>|null=null,backgroundStop=false,lastBackgroundLog=0,lastBackgroundRequest=0
saveBackground()
let lastLive=0
const live=async(force=false)=>{
 if(!force&&Date.now()-lastLive<5000)return
 const states=await Promise.all(clients.map((client,i)=>client.market!(saved.actors[i]!.key.installationId)))
 available=states.map(state=>state.wallet.available_incense)
 const first=states[0]!,clock=JSON.parse(readFileSync(clockPath,'utf8'))
 const firstDate=saved.days[0]!.date
 const db=new DatabaseSync(options.databasePath,{readOnly:true})
 let assertions:unknown,allPoolTotals:unknown,gifts:unknown
 try{
  db.exec('BEGIN')
  const scalar=(sql:string)=>Number(Object.values(db.prepare(sql).get()!)[0])
  assertions={walletJournalMismatches:scalar('SELECT count(*) FROM incense_wallet w LEFT JOIN (SELECT installation_id,sum(available_delta) a,sum(frozen_delta) f FROM incense_wallet_entry GROUP BY installation_id) j USING(installation_id) WHERE w.available!=coalesce(j.a,0) OR w.frozen!=coalesce(j.f,0)'),frozenPositionMismatches:scalar("SELECT count(*) FROM incense_wallet w LEFT JOIN (SELECT p.installation_id,sum(p.amount) amount FROM liang_market_position p JOIN liang_market m ON p.market_id=m.id WHERE m.status='open' AND p.payout IS NULL GROUP BY p.installation_id) p USING(installation_id) WHERE w.frozen!=coalesce(p.amount,0)"),closedPoolMismatches:scalar("SELECT count(*) FROM (SELECT p.market_id,p.batch FROM liang_market_position p JOIN liang_market m ON p.market_id=m.id WHERE m.status='closed' GROUP BY p.market_id,p.batch HAVING sum(p.amount)!=sum(p.payout))"),invalidWallets:scalar("SELECT count(*) FROM incense_wallet WHERE typeof(available)!='integer' OR typeof(frozen)!='integer' OR available<0 OR frozen<0 OR token_remainder<0 OR token_remainder>=token_per_incense")}
  allPoolTotals=db.prepare("SELECT m.business_date AS date,m.status,b.batch,b.result,sum(p.amount) invested,sum(p.payout) returned,sum(case when p.side='long' then p.amount else 0 end) longs,sum(case when p.side='short' then p.amount else 0 end) shorts FROM liang_market m JOIN liang_market_batch b ON b.market_id=m.id LEFT JOIN liang_market_position p ON p.market_id=m.id AND p.batch=b.batch WHERE m.business_date>=? GROUP BY m.id,b.batch ORDER BY m.business_date,b.batch").all(firstDate)
  gifts=saved.actors.map((actor,i)=>({number:i+1,days:db.prepare("SELECT business_date AS date,sum(available_delta+frozen_delta) incense FROM incense_wallet_entry WHERE installation_id=? AND kind='gift' AND business_date>=? GROUP BY business_date ORDER BY business_date").all(actor.key.installationId,firstDate)}))
  db.exec('ROLLBACK')
 }finally{db.close()}
 const completed=saved.days.filter(d=>d.closed)
 const fundingNote='沿用上一轮12个模拟钱包与既有资产；本轮不追加配资，仅保留正常日赠香。净收益不含此前测试补资；手动账号未自动配资。'
 atomic(directory+'/live.json',{
  kind:'signed-12-client-live',updated_at:new Date().toISOString(),status:completed.length>=saved.limitDays?'completed':clock.rate===0?'paused':'running',
  business_date:first.market?.business_date,server_time:first.server_time,rate:clock.rate,max_days:saved.limitDays,completed_days:completed.length,synthetic_usage:true,
  funding_note:fundingNote,
  funding:{policy:fundingNote,target:null,topup_dates:[],previous_round_topups:(prior.days??[]).filter(d=>d.minted.some(n=>n>0)).map(d=>({date:d.date,synthetic_minted:d.minted.reduce((n,a)=>n+a,0)})),days:saved.days.map(d=>({date:d.date,clients:d.opening.map((opening,i)=>({number:i+1,opening,synthetic_minted:d.minted[i],votes_spent:(d.spent[i]??0)+(background.spent[d.date]?.[i]??0)}))}))},
  background:{kind:'signed-small-incense',min_global_gap_ms:90,max_global_requests_per_second:12,per_request:[1,3],reserved_available:600,accepted_requests:background.requests,accepted_incense:background.incense,spent_by_date:background.spent,rejections:background.rejections,unknown:background.unknown,pending:background.pending!==null},
  gifts,
  clients:states.map((state,i)=>{
   const latest:any=(completed.at(-1)?.receipts??[]).find((r:any)=>r.client===i+1)
   return{number:i+1,business_date:state.market?.business_date,available:state.wallet.available_incense,frozen:state.wallet.frozen_incense,total:state.wallet.total_incense,
    positions:state.market?.batches.map(b=>({batch:b.batch,status:b.status,side:b.position?.side??null,amount:b.position?.amount??0,payout:b.position?.payout??null,pool_long:b.long_incense,pool_short:b.short_incense,result:b.result})),
    last_settlement:latest?{date:completed.at(-1)!.date,invested:latest.invested,returned:latest.returned,profit:latest.pnl}:null}
  }),
  days:completed.map(d=>({date:d.date,receipts:d.receipts})),audit:assertions,overallAudit:assertions,allPoolTotals,events:saved.events,errors:saved.errors
 })
 lastLive=Date.now()
}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
const withActor=async<T>(index:number,f:(client:BackendClient,key:CommunityKeypair)=>Promise<T>)=>f(clients[index]!,saved.actors[index]!.key)
const setup=async()=>{
 for(let index=0;index<clients.length;index++)await withActor(index,async(client,key)=>{
  try{await client.bootstrap(key.installationId)}catch(error){
   if(!(error instanceof BackendClientError)||error.code!=='admission_required')throw error
   let tickets=await client.admissionTickets(),ticket=tickets.tickets[0]
   if(!ticket)throw Error('no_admission_ticket')
   await client.claimAdmission(key.installationId,ticket.secret,key.publicKey,key.deviceFingerprint!)
  }
 })
}
const current=()=>clients[0]!.market!(saved.actors[0]!.key.installationId)
const intent=(name:string,payload:any)=>{
 const old=saved.intents[name]
 if(old){const{request_id:_,...rest}=old;if(JSON.stringify(rest)!==JSON.stringify(payload))throw Error('intent_payload_conflict');return old}
 const next={...payload,request_id:'fast-'+randomUUID()};saved.intents[name]=next;save();return next
}
const log=(event:string,data:unknown)=>console.log(JSON.stringify({event,...data as object}))
const dayFor=async(state:MarketState)=>{
 const market=state.market;if(!market)throw Error('market_missing')
 let day=saved.days.find(row=>row.market===market.id)
 if(day)return day
 day={date:market.business_date,market:market.id,events:{},opening:[],spent:Array(12).fill(0),minted:Array(12).fill(0)}
 saved.days.push(day);save()
 for(let index=0;index<clients.length;index++)await withActor(index,async(client,key)=>{
  await client.bootstrap(key.installationId)
  const mint=0
  day!.minted[index]=mint
  const current=await client.market!(key.installationId)
  day!.opening[index]=current.wallet.total_incense;available[index]=current.wallet.available_incense
 })
 save();log('day-ready',{date:day.date,clients:12,walletMinimum:Math.min(...day.opening)})
 return day
}
const position=async(day:Day,index:number,batch:MarketBatchId,side:'long'|'short'|null,amount:number,label:string)=>withActor(index,async(client,key)=>{
 const value=intent(`${day.market}:p:${index}:${batch}:${label}`,{market_id:day.market,batch,side,amount}) as MarketPositionRequest
 const result=await client.marketPosition!(key.installationId,value)
 if(!result.accepted)throw Error('position_rejected_'+result.reason)
 available[index]=result.state.wallet.available_incense
 saved.events++;save()
})
const vote=async(day:Day,index:number,type:'up'|'down',count:number,label:string)=>withActor(index,async(client,key)=>{
 const state=await client.market!(key.installationId)
 const value=intent(`${day.market}:v:${index}:${label}`,{case_id:state.market!.case_id,vote_type:type,count})
 const result=await client.vote(key.installationId,value)
 if(result.result.status!=='accepted')throw Error('vote_rejected')
 day.spent[index]=(day.spent[index]??0)+count;saved.events++;save()
})
const once=async(day:Day,name:string,f:()=>Promise<void>)=>{if(day.events[name])return;await f();day.events[name]=true;save()}
const act=async(state:MarketState)=>{
 const day=await dayFor(state),market=state.market!,hour=(state.server_time-Date.parse(market.business_date+'T00:00:00+08:00'))/3600000
 for(const b of market.batches){
  if(b.status==='open'){
   const openHour=(b.opens_at-Date.parse(market.business_date+'T00:00:00+08:00'))/3600000
   await once(day,`batch-${b.batch}-join`,async()=>{
    await Promise.all(clients.map((_,i)=>position(day,i,b.batch,(i+b.batch)%3===0?'short':'long',30+i*5,'join')))
    log('book-filled',{date:day.date,batch:b.batch,clients:12})
   })
   if(hour>=openHour+0.2)await once(day,`batch-${b.batch}-adjust`,()=>position(day,0,b.batch,'short',60,'adjust'))
   if(hour>=openHour+0.4)await once(day,`batch-${b.batch}-withdraw`,()=>position(day,2,b.batch,null,0,'withdraw'))
   if(hour>=openHour+0.6)await once(day,`batch-${b.batch}-reenter`,()=>position(day,2,b.batch,'short',45,'reenter'))
  }
 }
 await once(day,'seed-down',()=>vote(day,1,'down',1,'seed-down'))
 await once(day,'seed-up',()=>vote(day,0,'up',1,'seed-up'))
}
const backgroundTick=async()=>{
 const state=backgroundMarket,market=state?.market
 if(!market)return
 if(!background.pending){
  const clock=JSON.parse(readFileSync(clockPath,'utf8'));if(clock.rate===0)return
  const point=state.current_point,total=point?point.up_votes+point.down_votes:0
  const next=activityIntent(background.policy,Date.now(),available,total>0?point!.up_votes/total:null)
  if(!next)return
  background.pending={actor:next.actor,date:market.business_date,intent:{case_id:market.case_id,vote_type:next.vote_type,count:next.count,request_id:'activity-'+randomUUID()}}
  saveBackground()
 }
 const pending=background.pending,key=saved.actors[pending.actor]!.key
 try{
  const gap=Math.max(0,lastBackgroundRequest+90-Date.now());if(gap)await pause(gap)
  lastBackgroundRequest=Date.now()
  const response=await clients[pending.actor]!.vote(key.installationId,pending.intent)
  available[pending.actor]=response.authoritative_personal_state.wallet?.available_incense??response.authoritative_personal_state.remaining_incense
  if(response.result.status==='accepted'){
   background.requests++;background.incense+=pending.intent.count??1
   const day=background.spent[pending.date]??=Array(12).fill(0)
   day[pending.actor]=(day[pending.actor]??0)+(pending.intent.count??1)
  }else background.rejections++
  background.pending=null;saveBackground()
 }catch(error){
  // Unknown transport results retain the exact durable intent. A real HTTP
  // rejection can be cleared; authority, receipt idempotency and budget remain.
  if(error instanceof BackendClientError&&error.status!==null&&![408,429,500,502,503,504].includes(error.status)){
   background.rejections++;background.pending=null
  }else background.unknown++
  saveBackground();await pause(400)
 }
 if(Date.now()-lastBackgroundLog>=10_000){lastBackgroundLog=Date.now();log('background',{accepted_requests:background.requests,accepted_incense:background.incense,rejections:background.rejections,unknown:background.unknown,pending:background.pending!==null})}
}
const backgroundLoop=async()=>{while(!backgroundStop){backgroundBusy=backgroundTick();await backgroundBusy;backgroundBusy=null;await pause(15)}}
const settlePrevious=async(currentDate:string)=>{
 for(const day of saved.days.filter(d=>!d.closed&&d.date<currentDate)){
  const receipts:any[]=[]
  for(let i=0;i<clients.length;i++)await withActor(i,async(client,key)=>{
   const page=await client.marketHistory!(key.installationId,{limit:20})
   const receipt=page.receipts.find(r=>r.market_id===day.market)
   if(!receipt)throw Error('settlement_receipt_missing')
   if(!Number.isSafeInteger(receipt.returned_incense)||receipt.batches.some(b=>!Number.isSafeInteger(b.payout)))throw Error('non_integer_payout')
   receipts.push({client:i+1,invested:receipt.invested_incense,returned:receipt.returned_incense,pnl:receipt.pnl_incense,batches:receipt.batches.map(b=>({batch:b.batch,side:b.side,amount:b.amount,payout:b.payout,result:b.result}))})
  })
  day.closed=true;day.receipts=receipts;save();atomic(reportPath,{kind:'signed-12-client-fast-market',rate:720,limitDays:saved.limitDays,syntheticUsage:true,days:saved.days.map(({date,closed,receipts,spent})=>({date,closed,receipts,spent})),events:saved.events,errors:saved.errors})
  log('day-settled',{date:day.date,clients:receipts.length,winners:receipts.filter(r=>r.pnl>0).length,losers:receipts.filter(r=>r.pnl<0).length,invested:receipts.reduce((n,r)=>n+r.invested,0),returned:receipts.reduce((n,r)=>n+r.returned,0),profits:receipts.map(r=>r.pnl)})
 }
}
const stopClock=()=>{const clock=JSON.parse(readFileSync(clockPath,'utf8'));atomic(clockPath,{epoch_ms:Math.floor(clock.epoch_ms+Math.max(0,Date.now()-clock.anchor_wall_ms)*clock.rate),anchor_wall_ms:Date.now(),rate:0})}
try{
 await setup()
 const initial=await current()
 if(mode==='prepare'){
  const clock=JSON.parse(readFileSync(clockPath,'utf8'));if(clock.rate!==0)throw Error('prepare_requires_paused_clock')
  await act(initial)
  await live(true);log('prepared',{date:initial.market?.business_date,clients:12,events:saved.events,rate:0});return
 }
 saved.started??=Date.now();saved.startBusiness??=initial.server_time;save()
 let stopping=false
 const stop=()=>{stopping=true;backgroundStop=true;stopClock()}
 process.once('SIGINT',stop);process.once('SIGTERM',stop)
 const backgroundTask=backgroundLoop()
 while(!stopping){
  try{
   const state=await current();if(!state.market)throw Error('market_missing')
   if(backgroundMarket?.market?.id!==state.market.id){backgroundMarket=null;await backgroundBusy}
   await settlePrevious(state.market.business_date)
   if(saved.days.filter(d=>d.closed).length>=saved.limitDays){backgroundMarket=null;backgroundStop=true;await backgroundBusy;stopClock();await live(true);log('limit-reached',{days:saved.limitDays,rate:0});break}
   await act(state)
   backgroundMarket=state
   await live()
  }catch(error){const code=error instanceof BackendClientError?`backend_${error.status}_${error.code}`:error instanceof Error?error.message:'unknown';saved.errors.push({at:Date.now(),operation:'tick',code});save();log('error',{code});if(saved.errors.length>20){stopClock();throw Error('bounded_error_limit')}}
  await pause(200)
 }
 backgroundStop=true;await backgroundTask
 await live(true)
}finally{backgroundStop=true;await backgroundBusy;for(const c of clients)c.dispose()}

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  Promise.resolve().then(()=>runMarketActivity(parseMarketActivityArguments(process.argv.slice(2)))).catch(()=>{console.error('[liangxiang] isolated activity did not complete; inspect the private rehearsal state');process.exitCode=1})
}
