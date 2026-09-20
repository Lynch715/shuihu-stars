#!/usr/bin/env node
/** 抽样复核：用当前 gameData 里已调好的 enemy_* 跑真实胜率，看魅暴击是否把难度带偏 */
const { chromium } = require('playwright');
const HTML = process.argv[2], N = +(process.argv[3]||60);
const F = function (opt) {
  const { N } = opt;
  function tierOf(ch){return{star:ch<=2?1:ch<=6?2:ch<=12?3:ch<=20?4:5,size:Math.min(9,2+Math.floor((ch-1)*1.1)),gearQ:ch<=2?0:Math.min(6,Math.ceil(ch/5))};}
  const obtainable=(()=>{const byCh={};for(const sid of DB.stageIds()){const st=DB.stage(sid),ch=st.ch||1;(byCh[ch]||=new Set());const fr=st.first_reward||{};if(fr.hero&&DB.hero(fr.hero))byCh[ch].add(fr.hero);for(const d of(st.drops||[]))if(d.t==='hero'&&DB.hero(d.id))byCh[ch].add(d.id);}const cum={},acc=new Set(CFG.startHeroes);for(const ch of DB.chapters){for(const h of(byCh[ch]||[]))acc.add(h);cum[ch]=[...acc].filter(h=>DB.hero(h)&&DB.hero(h).src!=='杂兵');}return cum;})();
  function gearFor(ch){const q=tierOf(ch).gearQ,out={};for(const slot of SLOTS){const c=DB.equipIds().map(DB.equip).filter(e=>e&&e.slot===slot&&e.q<=q&&!e.exclusive).sort((a,b)=>b.q-a.q);if(c.length)out[slot]=c[0].id;}return out;}
  function buildTeam(sid){const st=DB.stage(sid),ch=st.ch||1;const{star,size,gearQ}=tierOf(ch);const lv=Math.max(1,(st.rec_lv||[1,5])[0]);
    if(ch===1){initGame();for(const hid of G.team){G.heroes[hid].lv=lv;G.heroes[hid].base=Object.assign({},grownBase(hid,lv));}return;}
    const pool=(obtainable[ch]||CFG.startHeroes).slice().sort((a,b)=>DB.hero(b).q-DB.hero(a).q);const team=pool.slice(0,size);const gear=gearQ>0?gearFor(ch):{};
    G.heroes={};G.team=[];for(const hid of team){const t=DB.hero(hid),h=makeHero(hid);h.lv=lv;h.star=star;h.base=Object.assign({},grownBase(hid,lv));h.owned=(t.sk||[]).slice(0,Math.min(star,4));h.equipment=Object.assign({weapon:null,armor:null,helmet:null,mount:null,special:null},gear);G.heroes[hid]=h;G.team.push(hid);} }
  function kindOf(sid){const st=DB.stage(sid);if(st.hidden)return'hidden';if(st.is_boss)return'boss';if(/_f\d+$/.test(sid))return'side';return'normal';}
  const TARGET={normal:[0.88,0.96],side:[0.72,0.86],boss:[0.50,0.68],hidden:[0.25,0.45]};
  const TE={normal:[0.94,0.99],side:[0.85,0.95],boss:[0.70,0.85],hidden:[0.25,0.45]};
  const all=DB.stageIds(), pick=all.filter((s,i)=>i%3===0);
  const out=[]; let rs=[];
  for(const sid of pick){const st=DB.stage(sid),ch=st.ch||1;buildTeam(sid);
    let w=0,r=0;for(let i=0;i<N;i++){const b=Battle.create(sid);if(!b||!b.foes.length){w=-1;break;}let g=0;while(!b.over&&g++<200)Battle.runRound(b);if(b.win)w++;r+=b.round;}
    if(w<0)continue; const k=kindOf(sid),[lo,hi]=(ch<=2?TE:TARGET)[k];
    const rate=w/N; rs.push(r/N);
    out.push({sid,k,rate:+rate.toFixed(2),lo,hi,ok:rate>=lo-0.06&&rate<=hi+0.06});}
  rs.sort((a,b)=>a-b);
  return {n:out.length,ok:out.filter(x=>x.ok).length,roundMed:+rs[Math.floor(rs.length/2)].toFixed(1),
          bad:out.filter(x=>!x.ok).map(x=>`${x.sid}[${x.k}] ${x.rate} 目标${x.lo}-${x.hi}`)};
};
(async()=>{const b=await chromium.launch();const p=await b.newPage();
 p.on('pageerror',e=>console.error('PAGEERROR',e.message));
 await p.goto('file://'+require('path').resolve(HTML));await p.waitForTimeout(500);
 const r=await p.evaluate(`(${F.toString()})({N:${N}})`);
 console.log(`抽样 ${r.n} 关　命中 ${r.ok}　中位回合 ${r.roundMed}`);
 r.bad.slice(0,25).forEach(x=>console.log('  偏  '+x));
 if(r.bad.length>25)console.log(`  …… 其余 ${r.bad.length-25} 关`);
 await b.close();})();
