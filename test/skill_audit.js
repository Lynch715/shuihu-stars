const fs=require('fs'), vm=require('vm'), assert=require('assert');
const file=process.argv[2]||'src/engine.js';
const data=JSON.parse(fs.readFileSync('data/gameData_v10.json','utf8'));
const ctx=vm.createContext({console,RAW_SKILLS:data.skills,document:{getElementById:()=>({textContent:JSON.stringify(data)})}});
vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const results=vm.runInContext(`(()=>{
 let seed=12345; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};

 const results=[];
 function test(name,fn){try{fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,error:e.message})}}
 function eq(a,b){if(a!==b)throw Error(JSON.stringify({actual:a,expected:b}))}
 function unit(id,ally=true,idx=0){const hero={lv:50,star:5,base:grownBase(id,50),owned:DB.hero(id).sk.slice(0,4),equipment:{}};G.heroes[id]=hero;return Battle.unit(id,Stats.calc(id,{hero,team:[],neutral:true}),ally,idx)}
 function battle(a,f){const b={allies:a,foes:f,round:1,over:false,log:[],events:[]};Battle.tagNames(b);return b}
 test('35 个定时指挥技在普通战斗保留触发字段',()=>{
   for(const id of DB.heroIds())for(const sk of unit(id).skills){const s=RAW_SKILLS[sk.id];if(s.every)eq(sk.rate,s.rate);if(s.from)eq(sk.from,s.from);if(s.every)eq(sk.every,s.every)}
 });
 test('伤害与吸血基数不能超过剩余生命',()=>{const a=unit('lin_chong'),t=unit('lu_junyi',false),b=battle([a],[t]);t.hp=10;t.shield=7;eq(Battle.hurt(b,t,1000,a,'','skill'),10);eq(t.tally.taken,17);eq(a.tally.dealt,17)});
 test('反击击杀施术者后群攻停止且后续效果不执行',()=>{const a=unit('lin_chong'),t=unit('lu_junyi',false),other=unit('guan_sheng',false,1),b=battle([a],[t,other]);a.hp=1;t.pas.counter={chance:1,mult:10};const hp=other.hp;Battle.cast(b,a,{name:'fixture',cat:'active',fx:[{k:'dmg',tg:'all',mult:0.1},{k:'shield',tg:'self',pct:.3}]});eq(a.alive,false);eq(other.hp,hp);eq(a.shield,0)});
 test('持续伤害触发残血被动',()=>{const a=unit('fang_jie'),t=unit('lin_chong',false),b=battle([a],[t]);a.hp=Math.ceil(a.maxHp*.51);const atk=Battle.eff(a,'atk');a.status.bleed={dur:1,mul:1};Battle.tick(b,a);eq(Battle.eff(a,'atk')>atk,true)});
 test('满血但有负面状态仍可施放治疗净化',()=>{const a=unit('an_daoquan'),t=unit('lin_chong',false),b=battle([a],[t]);a.status.stun={dur:1};eq(Battle.usable(b,a,DB.skill('adq2')),true)});
 test('治疗后的净化作用于刚治疗的同一个人',()=>{const a=unit('an_daoquan'),m=unit('lin_chong',true,1),t=unit('lu_junyi',false),b=battle([a,m],[t]);a.hp=Math.round(a.maxHp*.9);m.hp=Math.round(m.maxHp*.95);a.status.poison={dur:3,n:1};m.status.poison={dur:3,n:1};Battle.cast(b,a,DB.skill('adq2'));eq(!!a.status.poison,false);eq(!!m.status.poison,true)});
 test('重复夺取刷新自身增益且不无限叠加',()=>{const a=unit('wu_yong'),t=unit('lin_chong',false),b=battle([a],[t]);a.castName='fixture';const f={k:'steal',tg:'strongest',stat:'atk',pct:.2,dur:3};Battle.applyFx(b,a,f,[],1,null);const key='buff_atk|fixture';const val=a.status[key].val;a.status[key].dur=1;Battle.applyFx(b,a,f,[],1,null);eq(a.status[key].dur,3);eq(a.status[key].val,val)});
 test('定时指挥在正确回合触发且遵守发动率',()=>{const a=unit('lin_chong'),t=unit('lu_junyi',false),b=battle([a],[t]);a.cmds=[{name:'定时',cat:'cmd',from:2,fx:[{k:'buff',tg:'self',stat:'atk',pct:.1,dur:3}]}];Battle.prelude(b);eq(Object.keys(a.status).length,0);Battle.roundCmds(b);eq(Object.keys(a.status).length,0);b.round=2;Battle.roundCmds(b);eq(!!a.status['buff_atk|定时'],true);a.cmds=[{name:'每轮',cat:'cmd',every:true,rate:0,fx:[{k:'buff',tg:'self',stat:'def',pct:.1,dur:3}]}];Battle.roundCmds(b);eq(!!a.status['buff_def|每轮'],false);a.cmds[0].rate=1;Battle.roundCmds(b);eq(!!a.status['buff_def|每轮'],true)});
 test('控制至少阻止一次行动、免疫与毒层上限有效',()=>{const a=unit('lin_chong'),t=unit('lu_zhishen',false),b=battle([a],[t]);Battle.putStatus(b,a,t,{st:'stun',chance:1,dur:1});Battle.tick(b,t);eq(!!t.status.stun,true);Battle.afterAct(b,t);eq(!!t.status.stun,false);Battle.putStatus(b,a,t,{st:'chaos',chance:1,dur:1});eq(!!t.status.chaos,false);for(let i=0;i<9;i++)Battle.putStatus(b,a,t,{st:'poison',chance:1,dur:3,layers:2});eq(t.status.poison.n,5)});
 test('实际吸血不包含击杀溢出部分',()=>{const a=unit('lin_chong'),t=unit('lu_junyi',false),b=battle([a],[t]);a.hp=100;t.hp=10;t.pas.counter=null;const hp=a.hp;Battle.applyFx(b,a,{k:'dmg',tg:'single',mult:100,drain:.5},[],1,null);eq(a.hp-hp,5)});
 test('混乱经过智力比放大仍遵守控制加成95%上限',()=>{const a=unit('wu_yong'),t=unit('lin_chong',false),b=battle([a],[t]);a.int=10000;t.int=1;a.pas.ctrl=.2;t.pas.immune=[];const random=Math.random;Math.random=()=>.97;try{Battle.putStatus(b,a,t,{st:'chaos',chance:.8,dur:1});eq(!!t.status.chaos,false)}finally{Math.random=random}});
 test('1123 技能引用、字段范围与效果执行均有效',()=>{
 const active=new Set(['dmg','status','buff','debuff','heal','shield','steal','cleanse','dispel']);
 for(const id of Object.keys(RAW_SKILLS)){
  const s=DB.skill(id);eq(['active','sure','cmd','passive'].includes(s.cat),true);
  if(s.rate!=null)eq(Number.isFinite(s.rate)&&s.rate>=0&&s.rate<=1,true);
  for(const f of s.fx){for(const k of ['pct','chance','mult','val'])if(f[k]!=null)eq(Number.isFinite(f[k])&&f[k]>=0,true);if(f.chance!=null)eq(f.chance<=1,true);if(f.k==='status')eq(!!ST_NAME[f.st],true)}
  const a=unit('wu_yong'),m=unit('lin_chong',true,1),t=unit('lu_junyi',false),o=unit('guan_sheng',false,1),b=battle([a,m],[t,o]);for(const u of [...b.allies,...b.foes])u.hp=Math.round(u.maxHp*.65);
  if(s.cat==='passive')passivesOf([id]);else Battle.cast(b,a,s);
  for(const u of [...b.allies,...b.foes]){for(const k of ['hp','maxHp','shield','atk','def','int','agi'])eq(Number.isFinite(u[k])&&u[k]>=0,true);eq(u.hp<=u.maxHp,true)}
 }
 for(const id of DB.heroIds())for(const sk of DB.hero(id).sk)eq(!!DB.skill(sk),true);
 });
 return results;
})()`,ctx);
console.log(JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
