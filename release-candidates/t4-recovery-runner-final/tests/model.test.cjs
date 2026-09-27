const test=require('node:test'),assert=require('node:assert/strict');
const {create,flush,status,success}=require('./harness.cjs');
const seed=0x52560001;
function rng(n){return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
for(let i=0;i<1000;i++)test('model seed=0x52560001 sequence '+i,async()=>{
 const r=rng(seed+i),h=create({reply:({stage})=>stage==='SUBMITTING'?{pending:true,body:i%3===0?success:{success:false,code:'RECOVERY_APPROVAL_REQUIRED'}}:stage==='STATUS_CHECKING'?{body:{...status,requestStatus:i%2?'COMPLETED':'STARTED',historicalCompletion:Boolean(i%2)}}:{}});
 await flush();let attempted=false;const events=['precheck','right','wrong','recover','force','status','timeout','release'];
 const sequence=i<700?['precheck','right','recover',...Array.from({length:60},()=>events[Math.floor(r()*events.length)])]:Array.from({length:70},()=>events[Math.floor(r()*events.length)]);
 for(const event of sequence){
  if(['recover','force'].includes(event)&&h.state()==='READY'&&h.el('confirmation').value==='RECOVER EMP001')attempted=true;
  if(event==='right')h.phrase();if(event==='wrong')h.phrase('MIGRATE EMP001');
  if(event==='precheck')h.click('precheck');if(event==='recover'||event==='force'){h.el('recover').disabled=false;h.click('recover');h.click('recover');}
  if(event==='status')h.click('statusCheck');if(event==='timeout')h.expire();if(event==='release')h.release();await flush();
  assert(h.writes().length<=1);if(attempted)assert(!['READY','PRECHECK'].includes(h.state()));h.safe();
 }
 h.expire();h.release();await flush();if(attempted)await h.locked();h.safe();
});
