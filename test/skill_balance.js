const fs=require('fs'),vm=require('vm');
const raw=fs.readFileSync('data/gameData_v10.json','utf8');
const ctx=vm.createContext({console,auditOptions:{scale:Number(process.env.FOE_SCALE||0.65),limit:Number(process.env.HERO_LIMIT||0)},document:{getElementById:()=>({textContent:raw})}});
vm.runInContext(fs.readFileSync(process.argv[2]||'src/engine.js','utf8'),ctx);
const result=vm.runInContext(`(()=>{
 let seed=1; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const ids=DB.recruitPool.slice(0,auditOptions.limit||DB.recruitPool.length), out=[];
 const support=['qin_ming','dong_ping','xu_ning','mu_hong','lei_heng','huang_xin','suo_chao','zhang_qing'];
 const opp=['lin_chong','lu_junyi','guan_sheng','shi_wengong','gao_chong','du_jue','hu_yanzhuo','yue_fei','lu_zhishen'];
 function make(id,ally,i,team,lv,star){const hero={lv,star,base:grownBase(id,lv),owned:DB.hero(id).sk.slice(0,4),equipment:{}};G.heroes[id]=hero;return Battle.unit(id,Stats.calc(id,{hero,team,neutral:true}),ally,i,hero)}
 const frac=us=>us.reduce((s,u)=>s+u.hp,0)/us.reduce((s,u)=>s+u.maxHp,0);
 let fights=0;
 for(const [lv,star] of [[50,5],[70,7]])for(const id of ids){let wins=0,score=0,rounds=0,front=0,back=0;
  for(const pos of [0,7])for(let n=0;n<12;n++){
   seed=13579+n*997+pos*71;G.fates=[];
   const team=support.filter(h=>h!==id);while(team.length<8)team.push('shi_jin');team.splice(pos,0,id);
   const b={sid:'fixture',kind:'pvp',seed,stage:{},allies:team.map((h,i)=>make(h,true,i,team,lv,star)),foes:opp.map((h,i)=>make(h,false,i,opp,lv,star)),round:0,over:false,win:null,log:[],events:[]};
   for(const u of b.foes){for(const k of ['atk','def','int','agi','maxHp'])u[k]=Math.round(u[k]*auditOptions.scale);u.hp=u.maxHp;u.shield=Math.round(u.shield*auditOptions.scale)}
   Battle.tagNames(b);Battle.runAll(b);fights++;
   for(const u of [...b.allies,...b.foes])for(const k of ['hp','maxHp','shield','atk','def','int','agi'])if(!Number.isFinite(u[k])||u[k]<0||u.hp>u.maxHp)throw Error('invalid '+id+' '+k);
   const s=frac(b.allies)-frac(b.foes);score+=s;rounds+=b.round;if(b.win)wins++;if(pos===0)front+=s;else back+=s;
  }
  const h=DB.hero(id);out.push({id,name:h.name,q:h.q,lv,star,win:wins/24,score:+(score/24).toFixed(4),front:+(front/12).toFixed(4),back:+(back/12).toFixed(4),rounds:+(rounds/24).toFixed(2)});
 }
 return {fights,heroes:ids.length,scale:auditOptions.scale,method:'固定八名天罡队友，对九名绝世武将；前后排各12固定种子；敌方属性统一乘指定scale以避免全部碾压；无装备，保留羁绊，50级五星/70级七星；仅用于同条件对照',out};
})()`,ctx);
fs.writeFileSync(process.argv[3]||'test/artifacts/skill_balance_after.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({fights:result.fights,heroes:result.heroes,top:result.out.filter(h=>h.lv===70).sort((a,b)=>b.score-a.score).slice(0,10),bottom:result.out.filter(h=>h.lv===70&&h.q>=5).sort((a,b)=>a.score-b.score).slice(0,8)},null,2));
