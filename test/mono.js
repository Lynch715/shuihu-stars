const { chromium } = require('playwright');
const HTML=process.argv[2], SIDS=process.argv[3].split(',');
const MSARG=(process.argv[4]||'').split(',').filter(Boolean).map(Number);
const F=function(o){const{SIDS,MS}=o;const opt=o;
 function tierOf(ch){return{star:ch<=2?1:ch<=6?2:ch<=12?3:ch<=20?4:5,size:Math.min(9,2+Math.floor((ch-1)*1.1)),gearQ:ch<=2?0:Math.min(6,Math.ceil(ch/5))};}
 const obtainable=(()=>{const byCh={};for(const sid of DB.stageIds()){const st=DB.stage(sid),ch=st.ch||1;(byCh[ch]||=new Set());const fr=st.first_reward||{};if(fr.hero&&DB.hero(fr.hero))byCh[ch].add(fr.hero);for(const d of(st.drops||[]))if(d.t==='hero'&&DB.hero(d.id))byCh[ch].add(d.id);}const cum={},acc=new Set(CFG.startHeroes);for(const ch of DB.chapters){for(const h of(byCh[ch]||[]))acc.add(h);cum[ch]=[...acc].filter(h=>DB.hero(h)&&DB.hero(h).src!=='杂兵');}return cum;})();
 function gearFor(ch){const q=tierOf(ch).gearQ,out={};for(const slot of SLOTS){const c=DB.equipIds().map(DB.equip).filter(e=>e&&e.slot===slot&&e.q<=q&&!e.exclusive).sort((a,b)=>b.q-a.q);if(c.length)out[slot]=c[0].id;}return out;}
 function buildTeam(sid){const st=DB.stage(sid),ch=st.ch||1;const{star,size,gearQ}=tierOf(ch);const lv=Math.max(1,(st.rec_lv||[1,5])[0]);
  if(ch===1){initGame();for(const hid of G.team){G.heroes[hid].lv=lv;G.heroes[hid].base=Object.assign({},grownBase(hid,lv));}return {size:G.team.length,lv};}
  const pool=(obtainable[ch]||CFG.startHeroes).slice().sort((a,b)=>DB.hero(b).q-DB.hero(a).q);const team=pool.slice(0,size);const gear=gearQ>0?gearFor(ch):{};
  G.heroes={};G.team=[];for(const hid of team){const t=DB.hero(hid),h=makeHero(hid);h.lv=lv;h.star=star;h.base=Object.assign({},grownBase(hid,lv));h.owned=(t.sk||[]).slice(0,Math.min(star,4));h.equipment=Object.assign({weapon:null,armor:null,helmet:null,mount:null,special:null},gear);G.heroes[hid]=h;G.team.push(hid);}return{size:team.length,lv};}
 const out=[];
 for(const sid of SIDS){const info=buildTeam(sid);const st=DB.stage(sid);const row={sid,team:info,elv:st.enemy_lv,estar:st.enemy_star,foes:(st.enemies||[]).length,curve:[]};
  const oM=st.enemy_mul;
  for(const m of (MS||[0.12,0.3,0.6,1,2,4,8,16])){st.enemy_mul=m;let w=0;for(let i=0;i<120;i++){const b=Battle.create(sid);let g=0;while(!b.over&&g++<200)Battle.runRound(b);if(b.win)w++;}row.curve.push(m+':'+(w/120).toFixed(2));}
  st.enemy_mul=oM; out.push(row);}
 return out;};
(async()=>{const b=await chromium.launch();const p=await b.newPage();p.on('pageerror',e=>console.error('PE',e.message));await p.goto('file://'+require('path').resolve(HTML));await p.waitForTimeout(400);
 const r=await p.evaluate(`(${F.toString()})({SIDS:${JSON.stringify(SIDS)},MS:${JSON.stringify(MSARG.length?MSARG:null)}})`);
 r.forEach(x=>console.log(x.sid,`我方${x.team.size}人Lv${x.team.lv}　敌${x.foes}人Lv${x.elv}★${x.estar}`,'\n   ',x.curve.join('  ')));
 await b.close();})();
