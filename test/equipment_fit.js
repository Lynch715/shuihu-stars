const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto').webcrypto;
const root=require('path').resolve(__dirname,'..');
const ctx={crypto,console,document:{getElementById:()=>({textContent:fs.readFileSync(root+'/data/gameData_v10.json','utf8')})}};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(['engine.js','pvp_catalog.js','engine_pvp.js'].map(f=>fs.readFileSync(root+'/src/'+f,'utf8')).join('\n')+'\nwindow.api={G,DB,CFG,Stats,Grow,AutoGear,PVP,makeHero,grownBase,SLOTS};',ctx);
const {G,DB,CFG,Stats,Grow,AutoGear,PVP,makeHero,grownBase,SLOTS}=ctx.api;
ctx.api.Save=vm.runInContext('Save',ctx);ctx.api.Save.write=()=>{};
let checks=0;function ok(c,m){assert(c,m);checks++;console.log('✓ '+m)}
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(mode='classic',team=['lin_chong','wu_yong']){G.mode=mode;G.fates=[];G.heroes={};G.items={};G.team=team;G.pvp=null;for(const id of [...new Set([...team,'lu_junyi'])]){const h=makeHero(id);h.lv=50;h.star=5;h.base=copy(grownBase(id,50));h.owned=DB.hero(id).sk.slice(0,4);G.heroes[id]=h}PVP.init()}
const counts=()=>JSON.stringify(Object.entries(PVP.stock()).filter(([id,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)));
const worn=()=>JSON.stringify(Object.fromEntries(Object.entries(G.heroes).map(([id,h])=>[id,h.equipment])));
for(const mode of ['classic','chaos']){
 setup(mode);G.items={eq_w5:1,eq_jx_lin_chong_a:1,eq_jx_lin_chong_m:1,eq_w105_6:1,eq_w106_9:1,other_consumable:7};
 if(mode==='chaos'){G.heroes.lin_chong.sk=['qdq1'];G.heroes.lin_chong.owned=['qdq1'];G.heroes.wu_yong.sk=['lc1'];G.heroes.wu_yong.owned=['lc1']}
 // 专属曾被借给板凳角色，必须转交本人；总数应保持。
 G.heroes.lu_junyi.equipment.weapon='w5';delete G.items.eq_w5;
 const total=counts(),r=Grow.autoEquip();
 ok(G.heroes.lin_chong.equipment.weapon==='w5',mode+'：从板凳收回本人专属，优先于普通高阶武器');
 ok(G.heroes.lin_chong.equipment.armor==='jx_lin_chong_a'&&G.heroes.lin_chong.equipment.mount==='jx_lin_chong_m',mode+'：优先凑齐本人专属套装');
 ok(Stats.calc('lin_chong').pas.tough,mode+'：专属套装实际生效');
 ok(!G.heroes.lu_junyi.equipment.weapon&&r.fromBench===1,mode+'：被取走的板凳槽位正确清空');
 ok(counts()===total&&G.items.other_consumable===7,mode+'：装备总数与非装备物品保持');
 const eq=worn();Grow.autoEquip();ok(worn()===eq&&counts()===total,mode+'：重复一键配装稳定，不刷装备');
 PVP.init();G.pvp.cells=[...G.team,null,null,null,null,null,null,null];
 const adventure=JSON.stringify({items:G.items,heroes:G.heroes,team:G.team}),res=PVP.autoEquip();
 ok(G.pvp.gear.lin_chong.weapon==='w5'&&G.pvp.gear.lin_chong.armor==='jx_lin_chong_a'&&G.pvp.gear.lin_chong.mount==='jx_lin_chong_m',mode+' PVP：本人专属及套装优先');
 ok(adventure===JSON.stringify({items:G.items,heroes:G.heroes,team:G.team}),mode+' PVP：不移动闯关装备、不消耗背包、不改站位');
 const used={};for(const g of Object.values(G.pvp.gear))for(const id of Object.values(g))if(id)used[id]=(used[id]||0)+1;
 ok(Object.entries(used).every(([id,n])=>n<=PVP.stock()[id]),mode+' PVP：所有装备使用量均未超库存');
 const p=JSON.stringify(G.pvp.gear);PVP.autoEquip();ok(JSON.stringify(G.pvp.gear)===p,mode+' PVP：重复一键配装稳定');
}
setup('classic',['lin_chong','wu_yong']);G.items={eq_w105_6:1,eq_w106_9:1};Grow.autoEquip();
ok(G.heroes.lin_chong.equipment.weapon==='w105_6'&&G.heroes.wu_yong.equipment.weapon==='w106_9','传统：武将配武器、谋士配智力兵器');
setup('chaos',['lin_chong']);G.heroes.lin_chong.base={atk:1000,int:1000,def:400,agi:100,hp:2000};G.heroes.lin_chong.owned=['lc1'];G.items={eq_w105_6:1,eq_w106_9:1};Grow.autoEquip();ok(G.heroes.lin_chong.equipment.weapon==='w105_6','混乱：物理技能优先物理兵器');
G.heroes.lin_chong.sk=['qdq1'];G.heroes.lin_chong.owned=['qdq1'];Grow.autoEquip();ok(G.heroes.lin_chong.equipment.weapon==='w106_9','混乱：同一人物技能变成法术后改配智力兵器');
setup('classic',['wu_yong']);G.items={eq_w105_6:1,eq_w106_9:1};const state=JSON.stringify(G);const list=AutoGear.ranked('wu_yong',[DB.equip('w105_6'),DB.equip('w106_9')]);ok(list[0].id==='w106_9'&&JSON.stringify(G)===state,'手动选装按能力排序，评分过程不改存档');
setup('chaos',['lin_chong']);G.heroes.lin_chong.owned=['qdq1'];ok(AutoGear.ranked('lin_chong',[DB.equip('w106_9'),DB.equip('w5')])[0].id==='w5','混乱手动选装也把本人专属排在首位');
setup('classic',['lin_chong','wu_yong']);G.items={eq_w105_6:1};Grow.autoEquip();ok(Object.values(G.heroes).filter(h=>h.equipment.weapon==='w105_6').length===1,'一件通用装备只能配给一人');
setup('classic',['lin_chong']);G.heroes.lu_junyi.equipment.mount='m1';G.items={eq_w5:1,eq_jx_lin_chong_m:1};Grow.autoEquip();ok(G.heroes.lu_junyi.equipment.mount==='m1','板凳未被选走的装备保留');
setup();G.items={};ok(Grow.autoEquip().put===0,'空库存正常完成，不生成装备');G.team=[];ok(!!Grow.autoEquip().err,'空闯关阵容给出提示');G.pvp.cells=Array(9).fill(null);ok(!!PVP.autoEquip().err,'空 PVP 阵容给出提示');
setup('classic',DB.recruitPool.filter(id=>DB.hero(id).q===6).slice(0,9));for(const id of DB.equipIds())G.items['eq_'+id]=1;
const start=Date.now(),stock=counts();Grow.autoEquip();ok(counts()===stock,'全部324种装备大库存配装不丢装备');
for(const id of G.team)for(const e of DB.equipIds().map(DB.equip).filter(e=>e.exclusive===id))ok(G.heroes[id].equipment[e.slot]===e.id,'全库存专属保留：'+DB.hero(id).name+' '+e.name);
G.pvp.cells=G.team.slice();const before=JSON.stringify({items:G.items,heroes:G.heroes});PVP.autoEquip();ok(before===JSON.stringify({items:G.items,heroes:G.heroes}),'满九人全库存 PVP 配装保持闯关隔离');
console.log('PASS '+checks+' checks; 大库存闯关+PVP '+(Date.now()-start)+'ms');
