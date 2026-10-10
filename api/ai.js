const clean=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim();
const arr=(a,n,m)=>Array.isArray(a)?a.map(x=>clean(x).slice(0,m)).filter(Boolean).slice(0,n):[];
const SHAPES={
 sections:o=>{const s=(Array.isArray(o.sections)?o.sections:[]).map(x=>({name:clean(x&&x.name).slice(0,40),lines:arr(x&&x.lines,40,200)})).filter(x=>x.name&&x.lines.length).slice(0,20);return s.length?{sections:s}:null},
 lines:o=>{const l=arr(o.lines,40,200);return l.length?{lines:l}:null},
 hooks:o=>{const h=(Array.isArray(o.hooks)?o.hooks:[]).map(x=>({lines:arr(x&&x.lines,12,200),catchiness:+x.catchiness||0,rhyme:+x.rhyme||0,simplicity:+x.simplicity||0})).filter(x=>x.lines.length).slice(0,6);return h.length?{hooks:h}:null},
 titles:o=>{const t=arr(o.titles,12,100);return t.length?{titles:t}:null}};
const parse=(text,expect)=>{const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a<0||b<a)return null;try{return SHAPES[expect](JSON.parse(text.slice(a,b+1))||{})}catch{return null}};
const hits=new Map();
const limited=ip=>{const now=Date.now(),a=(hits.get(ip)||[]).filter(t=>now-t<60000);a.push(now);hits.set(ip,a);if(hits.size>5000)hits.clear();return a.length>10};
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 if(!process.env.ANTHROPIC_API_KEY)return res.status(503).json({code:'setup',error:'AI is not set up. Missing in the server environment: ANTHROPIC_API_KEY. Add it in Vercel (Settings, Environment Variables), then redeploy.'});
 const{prompt,expect}=req.body||{};
 if(typeof prompt!=='string'||prompt.length<5||prompt.length>14000||!SHAPES[expect])return res.status(400).json({error:'Invalid request.'});
 const ip=String((req.headers&&req.headers['x-forwarded-for'])||'x').split(',')[0].trim();
 if(limited(ip))return res.status(429).json({error:'Too many requests. Wait a minute and try again.'});
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),50000);
 try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:ctl.signal,headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
  body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-5-5',max_tokens:2500,system:'You are an expert songwriter, fluent in Nigerian Pidgin, Yoruba, Igbo and Hausa. Write original, singable lyrics with natural local expressions. Reply with the requested JSON only, no other text.',messages:[{role:'user',content:prompt}]})});
  if(r.status===401||r.status===403)return res.status(502).json({error:'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on the server.'});
  if(r.status===429)return res.status(429).json({error:'The AI service is busy. Please retry in a moment.'});
  if(!r.ok){let d='';try{d=JSON.stringify(await r.json())}catch{}return res.status(502).json({error:/credit balance/i.test(d)?'The Anthropic account has no credit left. Add credit in the Anthropic console.':'The AI service returned an error. Please retry.'})}
  const j=await r.json(),text=(j.content||[]).map(c=>c.text||'').join(''),data=parse(text,expect);
  if(!data)return res.status(502).json({error:'The AI returned a reply that could not be read. Please retry.'});
  return res.json({data})}
 catch(err){return res.status(502).json({error:err&&err.name==='AbortError'?'The AI took too long to respond. Please retry.':'Could not reach the AI service. Please retry.'})}
 finally{clearTimeout(t)}};
