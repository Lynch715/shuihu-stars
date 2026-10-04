const fs = require('fs'), vm = require('vm'), assert = require('assert');
const raw = fs.readFileSync('data/gameData_v10.json', 'utf8');
function run(file, lap, win, cleared = false) {
  const context = vm.createContext({console, document:{getElementById:()=>({textContent:raw})}});
  vm.runInContext('Math.random = () => 0.5', context);
  vm.runInContext(fs.readFileSync(file,'utf8').replace('const chance =', 'let chance ='), context);
  return vm.runInContext(`
    G.lap=${lap}; G.res={silver:0,gold:0,token:0}; G.items={};
    G.cleared=${cleared ? '{fixture:true}' : '{}'}; G.everCleared={}; G.clearCount=0;
    const probs=[]; chance=p=>{probs.push(p);return false};
    Grow.addExp=()=>[]; Fate.v=(k,d)=>d; Save.write=()=>{};
    Achv.onBattle=()=>{}; Achv.check=()=>[];
    Stages.woundReport=()=>{}; Stages.kindOf=()=> 'boss'; Stages.rollEquip=()=>null;
    const result=Stages.settle({sid:'fixture',win:${win},stage:{rec_lv:[10,20],ch:5,drops:[{t:'equip',rate:0.4}],first_reward:{}}});
    JSON.stringify({result,res:G.res,probs,foe:Lap.foeMulOf(2,5,5),token:Lap.tokenMul()});
  `,context);
}
const old='test/fixtures/engine_before_lap_balance.js', current='src/engine.js';
for(const win of [true,false]) for(const cleared of [true,false])
  assert.strictEqual(run(current,1,win,cleared),run(old,1,win,cleared),'一周目结算必须完全保持');
for(const lap of [2,3,4]) {
  const lossOld=JSON.parse(run(old,lap,false)),lossNew=JSON.parse(run(current,lap,false));
  assert.deepStrictEqual(lossNew.result,lossOld.result); assert.deepStrictEqual(lossNew.res,lossOld.res);

  const a=JSON.parse(run(old,lap,true)),b=JSON.parse(run(current,lap,true)), discount=lap===2?0.7:0.5;
  assert(b.res.silver<a.res.silver); assert(b.res.token<a.res.token);
  assert(Math.abs(b.foe/a.foe-(lap===2?1.2/.85:1.4/.86))<1e-10);
  assert(Math.abs(b.probs[0]-.05*discount)<1e-10);
  assert(Math.abs(b.probs[1]-.4*discount)<1e-10);
  for(const cleared of [false,true]) {
    const before=JSON.parse(run(old,lap,true,cleared)), after=JSON.parse(run(current,lap,true,cleared));
    const exps=x=>x.result.filter(r=>r.icon==='经').map(r=>Number(r.text.match(/\+(\d+)/)[1]));
    assert.deepStrictEqual(exps(after),exps(before).map(e=>Math.round(e*discount)));
  }
  console.log('周目',lap,'通过：敌方倍率、首通/重复通关经验银两、兵符、掉落、败仗补给');
}
assert.strictEqual(fs.readFileSync('index.html','utf8'),fs.readFileSync('水浒群星录_V10.9.2.html','utf8'));
console.log('一周目完全一致；构建入口一致');
