const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto').webcrypto;
const root=require('path').resolve(__dirname,'..');const store={};
const ctx={crypto,TextEncoder,TextDecoder,Date,console,Uint8Array,Response,Blob,CompressionStream,DecompressionStream,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),localStorage:{setItem:(k,v)=>store[k]=v,getItem:k=>store[k]||null},document:{getElementById:()=>({textContent:fs.readFileSync(root+'/data/gameData_v10.json','utf8')})}};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/src/engine.js','utf8')+'\n'+fs.readFileSync(root+'/src/pvp_catalog.js','utf8')+'\n'+fs.readFileSync(root+'/src/engine_pvp.js','utf8')+'\nwindow.api={G,CFG,DB,Battle,Stats,Save,makeHero,initGame,grownBase,SLOTS,Chaos};',ctx);
const {G,CFG,DB,Battle,Stats,Save,makeHero,initGame,grownBase,SLOTS,Chaos}=ctx.api,P=ctx.PVP;
let checks=0;function ok(c,m){assert(c,m);checks++;console.log('✓ '+m);}const copy=x=>JSON.parse(JSON.stringify(x));
function setup(mode='classic') {initGame(mode);G.heroes={};G.team=DB.recruitPool.slice().sort((a,b)=>DB.hero(b).q-DB.hero(a).q).slice(0,9);for(const id of G.team){const h=makeHero(id);h.lv=70;h.star=7;h.base=copy(grownBase(id,70));h.owned=(h.sk||DB.hero(id).sk).slice(0,4);G.heroes[id]=h;}G.lap=3;G.seenIntro=true;G.giftShown=true;P.init();G.pvp.name='验收好汉';G.pvp.cells=G.team.slice();}
(async()=>{
setup();let mine=P.snapshot(),foe=copy(mine);foe.owner='opponent-000000000001';foe.name='对手甲';for(const h of foe.team){h.lv=1;h.star=1;h.base=copy(grownBase(h.id,1));h.skills=DB.hero(h.id).sk.slice(0,1);}
ok((await P.encode(await P.decode(await P.encode(mine))))===(await P.encode(mine)),'传统七星快照与码往返');
ok((await P.decode((await P.encode(mine)).replace(/(.{70})/g,'$1\n'))).name===mine.name,'换行空白兼容');
for(const mutate of [x=>x.v=99,x=>x.team[1]=x.team[0],x=>x.team[0].eq[0]='bad',x=>x.team[0].skills=['bad'],x=>x.team[0].base.atk=Infinity]){let x=copy(mine);mutate(x);assert.throws(()=>P.validate(x));checks++;}
const key=await P.identity(foe);let renamed=copy(foe);renamed.name='改名者';ok(await P.identity(renamed)===key,'改名不能重置奖励身份');
await assert.rejects(P.create(mine));checks++;
G.fates=['fu2','ling','sha'];for(const h of Object.values(G.heroes))h.hurt={lv:1,rest:5};
const state=JSON.stringify({heroes:G.heroes,res:G.res,items:G.items,cleared:G.cleared,team:G.team,stats:G.stats,fates:G.fates});
let b=await P.create(foe),b2=await P.create(foe);Battle.runAll(b);Battle.runAll(b2);
ok(b.win===true,'真实九对九战斗获胜');ok(JSON.stringify(b.log)===JSON.stringify(b2.log),'相同阵容固定战斗种子');ok(Battle.context===undefined,'战斗上下文及时恢复');
let r=P.settle(b);ok(r[0].text.includes('对手甲的头颅')&&G.pvp.heads.length===1,'首次胜利获得头颅');
ok(P.settle(b).length===0&&G.pvp.records.length===1,'重复结算不重复写记录');
P.settle(b2);ok(G.pvp.heads.length===1&&G.pvp.records.length===1,'再次胜利更新唯一战绩');
ok(state===JSON.stringify({heroes:G.heroes,res:G.res,items:G.items,cleared:G.cleared,team:G.team,stats:G.stats,fates:G.fates}),'闯关培养资源伤病宿星均保持');
let loss=await P.create(foe);loss.over=true;loss.win=false;loss.result='lose';P.settle(loss);let draw=await P.create(foe);draw.over=true;draw.win=null;draw.result='draw';P.settle(draw);ok(G.pvp.records.length===1&&G.pvp.records[0].result==='平'&&G.pvp.heads.length===1,'败平记录无头颅');
let timed=await P.create(foe);timed.round=29;for(const u of [...timed.allies,...timed.foes]){u.maxHp=u.hp=1e15;u.skills=[];u.actives=[];u.cmds=[];}Battle.runRound(timed);ok(timed.result==='draw'&&timed.win===null,'真实三十回合超时平局');
const e=DB.equipIds().find(id=>DB.equip(id).slot==='weapon');G.items['eq_'+e]=1;P.equip(G.team[0],'weapon',e);assert.throws(()=>P.equip(G.team[1],'weapon',e));checks++;P.equip(G.team[0],'weapon',null);P.equip(G.team[1],'weapon',e);ok(G.items['eq_'+e]===1&&G.heroes[G.team[1]].equipment.weapon===null,'PVP 配装数量与闯关独立');delete G.items['eq_'+e];P.clean();ok(!G.pvp.gear[G.team[1]].weapon,'卖出装备后清理不可用 PVP 配装');
for(let i=0;i<102;i++){const unique=copy(foe);unique.owner='unique-opponent-'+String(i).padStart(16,'0');let x=await P.create(unique);x.over=true;x.win=false;P.settle(x);}ok(G.pvp.records.length===100&&G.pvp.heads.length===1,'百场记录上限与收藏长期保留');
const latest=copy(G.pvp.records[0]);latest.time+=100;const renamedFoe=await P.decode(latest.opponent);renamedFoe.name='改名';latest.opponent=await P.encode(renamedFoe);latest.oname='改名';G.pvp.records.push(latest);P.init();ok(G.pvp.records.length===100&&P.oname(G.pvp.records[0])==='改名','重复记录按奖励身份合并，改名不产生重复');
ok(G.pvp.records.every(r=>typeof r.mine==='string'&&typeof r.opponent==='string'&&r.key)&&G.pvp.heads.every(h=>typeof h.opponent==='string'),'战绩与头颅存的是对战码');
// 旧档迁移：V10.9.2 以前 records/heads 里是展开快照，进 PVP 一次性转成码，头颅与已领取不变
{const oldRec=copy(G.pvp.records[5]);const foeObj=copy(await P.decode(oldRec.opponent)),mineObj=copy(await P.decode(oldRec.mine));
 G.pvp.records.splice(5,1,{time:oldRec.time,result:'败',rounds:3,mine:mineObj,opponent:foeObj,reward:null});
 G.pvp.heads.push({name:'旧头颅',time:1,key:'legacy-key',opponent:foeObj});G.pvp.claimed['legacy-key']=true;
 ok(P.pending(),'检测到待迁移的旧战绩');const saveBefore=JSON.stringify({heads:G.pvp.heads.length,claimed:G.pvp.claimed});
 const n=await P.migrate();ok(n===2&&!P.pending(),'旧战绩与头颅迁移为对战码');
 ok(G.pvp.records.length===100&&G.pvp.records.find(r=>r.time===oldRec.time).key===oldRec.key&&P.oname(G.pvp.records.find(r=>r.time===oldRec.time))===foeObj.name,'迁移后身份键与姓名正确，条数不变');
 ok(saveBefore===JSON.stringify({heads:G.pvp.heads.length,claimed:G.pvp.claimed})&&typeof G.pvp.heads.find(h=>h.key==='legacy-key').opponent==='string','迁移不改头颅数与已领取状态');
 G.pvp.heads=G.pvp.heads.filter(h=>h.key!=='legacy-key');delete G.pvp.claimed['legacy-key'];}
// 存档体积：100 条战绩全存码
{Save.write();const bytes=store[CFG.saveKey].length;ok(bytes<80000,'百场战绩存档不超过 80KB（实测 '+bytes+' 字节）');}
const code=await Save.exportCode();const parsed=await Save.parseCode(code);ok(!parsed.err&&parsed.d.pvp.heads.length===1&&parsed.d.pvp.records.length===100,'PVP 存档码导出与导入往返');
setup('chaos');mine=P.snapshot();foe=copy(mine);foe.owner='opponent-000000000002';foe.name='混乱对手';let cb=await P.create(foe);ok(JSON.stringify(cb.foes[0].skills.map(s=>s.id))===JSON.stringify(mine.team[0].skills),'混乱对手使用快照随机技能');
ok(cb.allies[0].atk===cb.foes[0].atk&&cb.allies[0].maxHp===cb.foes[0].maxHp,'双方同属性计算口径');Battle.runAll(cb);ok(cb.over&&cb.round<=30,'混乱对混乱真实对战完成');
let classicFoe=copy(mine);classicFoe.mode='classic';classicFoe.owner='opponent-000000000004';for(const h of classicFoe.team)h.skills=DB.hero(h.id).sk.slice(0,Math.min(h.star,4));let mixed=await P.create(classicFoe);Battle.runAll(mixed);ok(mixed.over,'混乱与传统跨模式真实对战完成');
setup();let strong=copy(P.snapshot());strong.owner='opponent-000000000005';strong.name='强敌';for(const h of Object.values(G.heroes)){h.lv=1;h.star=1;h.base=copy(grownBase(h.hid,1));h.owned=DB.hero(h.hid).sk.slice(0,1);}let actualLoss=await P.create(strong);Battle.runAll(actualLoss);P.settle(actualLoss);ok(actualLoss.win===false&&G.pvp.heads.length===0&&G.pvp.records[0].result==='败','真实败局无奖励');
setup();const without=P.units(P.snapshot(),true).map(u=>[u.atk,u.def,u.int,u.agi,u.maxHp]);G.fates=['fu2','ling','an'];const withFates=P.units(P.snapshot(),true).map(u=>[u.atk,u.def,u.int,u.agi,u.maxHp]);ok(JSON.stringify(without)===JSON.stringify(withFates),'PVP 属性不受宿星影响');G.fates=[];
// 短码必须保留所有字段，兼容旧码、身份与奖励；覆盖满装混乱和最长姓名。
setup();let normal=P.snapshot();const old=P.LEGACY+ctx.btoa(Buffer.from(JSON.stringify(normal),'utf8').toString('binary'));
ok(JSON.stringify(copy(await P.decode(old)))===JSON.stringify(copy(normal)),'旧 SHP1 对战码完整兼容');
const short=await P.encode(normal);ok(short.length<=200&&short.startsWith('SHP2:'),'常规传统英文数字短码不超过 200 字');
ok(/^[0-9a-f]{16}$/.test(normal.owner)&&P.bytesCode(short)[1]&8,'新档身份 8 字节十六进制');
ok(JSON.stringify(copy(await P.decode(short)))===JSON.stringify(copy(normal)),'短码完整还原身份姓名培养站位技能装备');
ok(await P.identity(await P.decode(short))===await P.identity(await P.decode(old)),'新旧码奖励摘要与种子一致');
await assert.rejects(P.decode(short.slice(0,-1)));checks++;
const bytes=P.bytesCode(short);bytes[8]^=1;await assert.rejects(P.decode(P.textCode(bytes)));checks++;
const dictBytes=P.bytesCode(short),dictBody=dictBytes.slice(0,-4);dictBody[0]=99;dictBytes.set(await P.checksum(dictBody),dictBody.length);await assert.rejects(P.decode(P.textCode(dictBytes)));checks++;
const lengths=[];
for(const mode of ['classic','chaos'])for(const name of ['好汉','好'.repeat(16),'😀'.repeat(16)])for(const full of [false,true]){
 setup(mode);G.pvp.name=name;const s=P.snapshot();if(full)for(const h of s.team)h.eq=SLOTS.map(sl=>DB.equipIds().filter(id=>DB.equip(id).slot===sl).slice(-1)[0]);
 if(mode==='chaos')for(const h of s.team)h.skills=Chaos.all().slice(-4);
 const code=await P.encode(s),back=await P.decode(code);ok(code.length<=P.MAX&&code.startsWith('SHP2:'),mode+' / '+[...name].length+'字姓名 / '+(full?'满装':'裸装')+' Base64URL 码≤'+P.MAX+'（'+code.length+'）');
 assert.equal(JSON.stringify(copy(back)),JSON.stringify(copy(s)));checks++;
 lengths.push({mode,nameChars:[...name].length,full,length:code.length,format:code.slice(0,5)});
}
// 现实最坏：数据重平衡后的旧档（45 项培养都和模板差几十点）、16 字姓名、混乱满装
setup('chaos');G.pvp.name='好'.repeat(16);let custom=P.snapshot();for(const h of custom.team){h.eq=SLOTS.map(sl=>DB.equipIds().filter(id=>DB.equip(id).slot===sl).slice(-1)[0]);h.skills=Chaos.all().slice(-4);let i=0;for(const k of Object.keys(h.base))h.base[k]+=[37,-12,250,-20,1500][i++];}
const customCode=await P.encode(custom);ok(customCode.length<=P.MAX&&JSON.stringify(copy(await P.decode(customCode)))===JSON.stringify(copy(custom)),'重平衡旧档差值逐项保存，16 字名满装混乱仍≤'+P.MAX+'（'+customCode.length+'）');
{let huge=copy(custom);huge.name='巨';for(const h of huge.team)for(const k of Object.keys(h.base))h.base[k]=1000000;const hugeCode=await P.encode(huge);ok(hugeCode.length<=P.MAX&&(await P.decode(hugeCode)).team[8].base.hp===1000000,'差值装不下时回落 20 位绝对值（'+hugeCode.length+'）');
 huge.name='😀'.repeat(16);await assert.rejects(P.encode(huge),/容量/);checks++;}
let fractional=copy(custom);fractional.name='保留小数';fractional.team[0].base.atk=123.25;for(const h of fractional.team.slice(1))h.base=copy(grownBase(h.id,h.lv));const floatCode=await P.encode(fractional);ok((await P.decode(floatCode)).team[0].base.atk===123.25,'旧档非整数培养值精确保留');
ok(!lengths.some(x=>x.format==='SHU2:'),'不再生成 SHU2 汉字码');
// 兼容：V10.9.1–10.9.2 发出去的 SHU2 汉字码、v1 字典码仍能解
const denseOf=bytes=>{const frame=new Uint8Array(bytes.length+2);frame[0]=bytes.length>>>8;frame[1]=bytes.length&255;frame.set(bytes,2);let text=P.DENSE,value=0,count=0;for(const byte of frame){value=(value<<8)|byte;count+=8;while(count>=14){count-=14;text+=String.fromCharCode(0x4e00+((value>>>count)&16383));value&=(1<<count)-1;}}if(count)text+=String.fromCharCode(0x4e00+(value<<(14-count)));return text;};
const cat=vm.runInContext('SH_PVP_CATALOG',ctx);const v2={v:cat.v,bits:cat.bits};
setup();G.pvp.owner='8d6f2c1a-3b4e-4f5a-9c7d-0e1f2a3b4c5d';G.pvp.name='旧档玩家';const legacyOwnerSnap=P.snapshot();for(const h of legacyOwnerSnap.team)h.eq=SLOTS.map(sl=>DB.equipIds().filter(id=>DB.equip(id).slot===sl).slice(-1)[0]);
Object.assign(cat,{v:1,bits:P.V1BITS});const v1code=await P.encode(legacyOwnerSnap);const shu2=denseOf(P.bytesCode(v1code));Object.assign(cat,v2);
ok(P.bytesCode(v1code)[0]===1&&JSON.stringify(copy(await P.decode(v1code)))===JSON.stringify(copy(legacyOwnerSnap)),'v1 字典码在 v2 下完整解出');
ok(JSON.stringify(copy(await P.decode(shu2.replace(/(.{20})/g,'$1 \n'))))===JSON.stringify(copy(legacyOwnerSnap)),'旧 SHU2 汉字码仍能解，含传输空白');
ok(await P.identity(await P.decode(v1code))===await P.identity(await P.decode(await P.encode(legacyOwnerSnap))),'v1 与 v2 码奖励身份一致，旧头颅不重领');
ok(P.bytesCode(await P.encode(legacyOwnerSnap))[1]&4,'旧档 UUID 身份原样 16 字节');
// 字典追加一件兵器、一位将领，旧码不受影响；位宽超容时明确报错
{const v2code=await P.encode(legacyOwnerSnap);cat.gear[0].push('__test_weapon__');cat.heroes.push('__test_hero__');cat.growth.push([[1,1,1,1,1],[0,0,0,0,0]]);
 ok(JSON.stringify(copy(await P.decode(v2code)))===JSON.stringify(copy(legacyOwnerSnap))&&JSON.stringify(copy(await P.decode(v1code)))===JSON.stringify(copy(legacyOwnerSnap)),'字典末尾追加后 v1/v2 旧码照常解出');
 cat.gear[0].pop();cat.heroes.pop();cat.growth.pop();
 const saveBits=cat.bits;cat.bits={...saveBits,gear:[6,7,6,7,6]};await assert.rejects(P.encode(legacyOwnerSnap),/容量/);cat.bits=saveBits;checks++;}
console.log('短码长度样本:',JSON.stringify(lengths));console.log('全项差异培养极限长度:',customCode.length);
fs.writeFileSync('/tmp/sh_pvp_short_lengths.json',JSON.stringify(lengths,null,2));
setup();

G.pvp.name='验收好汉';G.pvp.records=[];G.pvp.heads=[];G.pvp.claimed={};Save.write();fs.writeFileSync('/tmp/sh_pvp_fixture.txt',store[CFG.saveKey]);
foe=copy(P.snapshot());foe.owner='opponent-000000000003';foe.name='试刀好汉';for(const h of foe.team){h.lv=1;h.star=1;h.base=copy(grownBase(h.id,1));h.skills=DB.hero(h.id).sk.slice(0,1);}fs.writeFileSync('/tmp/sh_pvp_foe.txt',await P.encode(foe));
const ordinary=Battle.create(DB.stageIds()[0]);Battle.runAll(ordinary);ok(ordinary.over&&ordinary.kind!=='pvp','原闯关战斗正常结束');
console.log('PASS '+checks+' checks');
})().catch(e=>{console.error(e);process.exit(1)});
