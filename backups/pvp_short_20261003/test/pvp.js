const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto').webcrypto;
const root=require('path').resolve(__dirname,'..');const store={};
const ctx={crypto,TextEncoder,TextDecoder,Date,console,Uint8Array,Response,Blob,CompressionStream,DecompressionStream,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),localStorage:{setItem:(k,v)=>store[k]=v,getItem:k=>store[k]||null},document:{getElementById:()=>({textContent:fs.readFileSync(root+'/data/gameData_v10.json','utf8')})}};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/src/engine.js','utf8')+'\n'+fs.readFileSync(root+'/src/engine_pvp.js','utf8')+'\nwindow.api={G,CFG,DB,Battle,Stats,Save,makeHero,initGame,grownBase,SLOTS,Chaos};',ctx);
const {G,CFG,DB,Battle,Stats,Save,makeHero,initGame,grownBase,SLOTS,Chaos}=ctx.api,P=ctx.PVP;
let checks=0;function ok(c,m){assert(c,m);checks++;console.log('✓ '+m);}const copy=x=>JSON.parse(JSON.stringify(x));
function setup(mode='classic') {initGame(mode);G.heroes={};G.team=DB.recruitPool.slice().sort((a,b)=>DB.hero(b).q-DB.hero(a).q).slice(0,9);for(const id of G.team){const h=makeHero(id);h.lv=70;h.star=7;h.base=copy(grownBase(id,70));h.owned=(h.sk||DB.hero(id).sk).slice(0,4);G.heroes[id]=h;}G.lap=3;G.seenIntro=true;G.giftShown=true;P.init();G.pvp.name='验收好汉';G.pvp.cells=G.team.slice();}
(async()=>{
setup();let mine=P.snapshot(),foe=copy(mine);foe.owner='opponent-000000000001';foe.name='对手甲';for(const h of foe.team){h.lv=1;h.star=1;h.base=copy(grownBase(h.id,1));h.skills=DB.hero(h.id).sk.slice(0,1);}
ok(P.encode(P.decode(P.encode(mine)))===P.encode(mine),'传统七星快照与码往返');
ok(P.decode(P.encode(mine).replace(/(.{70})/g,'$1\n')).name===mine.name,'换行空白兼容');
for(const mutate of [x=>x.v=99,x=>x.team[1]=x.team[0],x=>x.team[0].eq[0]='bad',x=>x.team[0].skills=['bad'],x=>x.team[0].base.atk=Infinity]){let x=copy(mine);mutate(x);assert.throws(()=>P.validate(x));checks++;}
const key=await P.identity(foe);let renamed=copy(foe);renamed.name='改名者';ok(await P.identity(renamed)===key,'改名不能重置奖励身份');
await assert.rejects(P.create(mine));checks++;
G.fates=['fu2','ling','sha'];for(const h of Object.values(G.heroes))h.hurt={lv:1,rest:5};
const state=JSON.stringify({heroes:G.heroes,res:G.res,items:G.items,cleared:G.cleared,team:G.team,stats:G.stats,fates:G.fates});
let b=await P.create(foe),b2=await P.create(foe);Battle.runAll(b);Battle.runAll(b2);
ok(b.win===true,'真实九对九战斗获胜');ok(JSON.stringify(b.log)===JSON.stringify(b2.log),'相同阵容固定战斗种子');ok(Battle.context===undefined,'战斗上下文及时恢复');
let r=P.settle(b);ok(r[0].text.includes('对手甲的头颅')&&G.pvp.heads.length===1,'首次胜利获得头颅');
ok(P.settle(b).length===0&&G.pvp.records.length===1,'重复结算不重复写记录');
P.settle(b2);ok(G.pvp.heads.length===1&&G.pvp.records.length===2,'再次胜利只有战绩');
ok(state===JSON.stringify({heroes:G.heroes,res:G.res,items:G.items,cleared:G.cleared,team:G.team,stats:G.stats,fates:G.fates}),'闯关培养资源伤病宿星均保持');
let loss=await P.create(foe);loss.over=true;loss.win=false;loss.result='lose';P.settle(loss);let draw=await P.create(foe);draw.over=true;draw.win=null;draw.result='draw';P.settle(draw);ok(G.pvp.records[0].result==='平'&&G.pvp.records[1].result==='败'&&G.pvp.heads.length===1,'败平记录无头颅');
let timed=await P.create(foe);timed.round=29;for(const u of [...timed.allies,...timed.foes]){u.maxHp=u.hp=1e15;u.skills=[];u.actives=[];u.cmds=[];}Battle.runRound(timed);ok(timed.result==='draw'&&timed.win===null,'真实三十回合超时平局');
const e=DB.equipIds().find(id=>DB.equip(id).slot==='weapon');G.items['eq_'+e]=1;P.equip(G.team[0],'weapon',e);assert.throws(()=>P.equip(G.team[1],'weapon',e));checks++;P.equip(G.team[0],'weapon',null);P.equip(G.team[1],'weapon',e);ok(G.items['eq_'+e]===1&&G.heroes[G.team[1]].equipment.weapon===null,'PVP 配装数量与闯关独立');delete G.items['eq_'+e];P.clean();ok(!G.pvp.gear[G.team[1]].weapon,'卖出装备后清理不可用 PVP 配装');
for(let i=0;i<102;i++){let x=await P.create(foe);x.over=true;x.win=false;P.settle(x);}ok(G.pvp.records.length===100&&G.pvp.heads.length===1,'百场记录上限与收藏长期保留');
const code=await Save.exportCode();const parsed=await Save.parseCode(code);ok(!parsed.err&&parsed.d.pvp.heads.length===1&&parsed.d.pvp.records.length===100,'PVP 存档码导出与导入往返');
setup('chaos');mine=P.snapshot();foe=copy(mine);foe.owner='opponent-000000000002';foe.name='混乱对手';let cb=await P.create(foe);ok(JSON.stringify(cb.foes[0].skills.map(s=>s.id))===JSON.stringify(mine.team[0].skills),'混乱对手使用快照随机技能');
ok(cb.allies[0].atk===cb.foes[0].atk&&cb.allies[0].maxHp===cb.foes[0].maxHp,'双方同属性计算口径');Battle.runAll(cb);ok(cb.over&&cb.round<=30,'混乱对混乱真实对战完成');
let classicFoe=copy(mine);classicFoe.mode='classic';classicFoe.owner='opponent-000000000004';for(const h of classicFoe.team)h.skills=DB.hero(h.id).sk.slice(0,Math.min(h.star,4));let mixed=await P.create(classicFoe);Battle.runAll(mixed);ok(mixed.over,'混乱与传统跨模式真实对战完成');
setup();let strong=copy(P.snapshot());strong.owner='opponent-000000000005';strong.name='强敌';for(const h of Object.values(G.heroes)){h.lv=1;h.star=1;h.base=copy(grownBase(h.hid,1));h.owned=DB.hero(h.hid).sk.slice(0,1);}let actualLoss=await P.create(strong);Battle.runAll(actualLoss);P.settle(actualLoss);ok(actualLoss.win===false&&G.pvp.heads.length===0&&G.pvp.records[0].result==='败','真实败局无奖励');
setup();const without=P.units(P.snapshot(),true).map(u=>[u.atk,u.def,u.int,u.agi,u.maxHp]);G.fates=['fu2','ling','an'];const withFates=P.units(P.snapshot(),true).map(u=>[u.atk,u.def,u.int,u.agi,u.maxHp]);ok(JSON.stringify(without)===JSON.stringify(withFates),'PVP 属性不受宿星影响');G.fates=[];
G.pvp.name='验收好汉';G.pvp.records=[];G.pvp.heads=[];G.pvp.claimed={};Save.write();fs.writeFileSync('/tmp/sh_pvp_fixture.txt',store[CFG.saveKey]);
foe=copy(P.snapshot());foe.owner='opponent-000000000003';foe.name='试刀好汉';for(const h of foe.team){h.lv=1;h.star=1;h.base=copy(grownBase(h.id,1));h.skills=DB.hero(h.id).sk.slice(0,1);}fs.writeFileSync('/tmp/sh_pvp_foe.txt',P.encode(foe));
const ordinary=Battle.create(DB.stageIds()[0]);Battle.runAll(ordinary);ok(ordinary.over&&ordinary.kind!=='pvp','原闯关战斗正常结束');
console.log('PASS '+checks+' checks');
})().catch(e=>{console.error(e);process.exit(1)});
