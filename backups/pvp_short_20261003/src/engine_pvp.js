/* 异步 PVP：独立快照、五槽装备数量校验、混乱技能与收藏。 */
const PVP = {
  PREFIX: 'SHP1:', RULE: 1,
  init() {
    G.pvp ||= { owner: crypto.randomUUID(), name: '', cells: Array(9).fill(null), gear: {}, claimed: {}, heads: [], records: [] };
    this.clean(); return G.pvp;
  },
  stock() {
    const out = {};
    for (const [k, n] of Object.entries(G.items)) if (k.startsWith('eq_') && DB.equip(k.slice(3))) out[k.slice(3)] = n;
    for (const h of Object.values(G.heroes)) for (const sl of SLOTS) { const id = h.equipment[sl]; if (id && DB.equip(id)) out[id] = (out[id] || 0) + 1; }
    return out;
  },
  clean() {
    const p = G.pvp; if (!p) return;
    p.owner ||= crypto.randomUUID(); p.gear ||= {}; p.claimed ||= {}; p.heads ||= []; p.records ||= [];
    const seen = new Set(), used = {}, stock = this.stock();
    p.cells = Array.from({length: 9}, (_, i) => { const id = (p.cells || [])[i]; if (!G.heroes[id] || seen.has(id)) return null; seen.add(id); return id; });
    for (const id of Object.keys(p.gear)) if (!seen.has(id)) delete p.gear[id];
    for (const id of p.cells.filter(Boolean)) for (const sl of SLOTS) {
      const gear = p.gear[id] ||= {}, e = gear[sl], data = DB.equip(e);
      if (!data || data.slot !== sl || (used[e] || 0) >= (stock[e] || 0)) gear[sl] = null;
      else used[e] = (used[e] || 0) + 1;
    }
  },
  validate(raw) {
    const fail = m => { throw Error(m); }, int = (x,a,b) => Number.isInteger(x) && x>=a && x<=b;
    if (!raw || raw.kind !== 'sh-pvp' || raw.v !== this.RULE) fail('对战码版本不兼容，请使用水浒 PVP 对战码');
    if (typeof raw.owner !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(raw.owner)) fail('对战码缺少玩家身份');
    if (typeof raw.name !== 'string' || !raw.name.trim() || [...raw.name.trim()].length > 16 || /[\u0000-\u001f]/.test(raw.name)) fail('姓名须为 1 至 16 个字');
    if (!['classic','chaos'].includes(raw.mode)) fail('模式无效');
    if (!Array.isArray(raw.team) || raw.team.length !== 9) fail('必须上满九位将领');
    const seen = new Set();
    const team = raw.team.map(h => {
      if (!h || !DB.recruitPool.includes(h.id) || seen.has(h.id)) fail('将领无效或重复'); seen.add(h.id);
      if (!int(h.lv,1,70) || !int(h.star,1,7)) fail('等级或星级无效');
      if (!Array.isArray(h.eq) || h.eq.length !== 5) fail('装备资料不完整');
      const eq = h.eq.map((e,i) => { if (e === null) return null; if (typeof e !== 'string' || !DB.equip(e) || DB.equip(e).slot !== SLOTS[i]) fail('装备无效或槽位不符'); return e; });
      const expected = Math.min(h.star,4);
      if (!Array.isArray(h.skills) || h.skills.length !== expected || new Set(h.skills).size !== expected || h.skills.some(id => !DB.skill(id))) fail('技能资料无效');
      if (raw.mode === 'classic' && JSON.stringify(h.skills) !== JSON.stringify(DB.hero(h.id).sk.slice(0,expected))) fail('传统模式技能不符');
      if (raw.mode === 'chaos' && h.skills.some(id => !Chaos.all().includes(id))) fail('混乱技能不在技能池');
      const base = {};
      for (const k of GROW_KEYS) { const x = h.base && h.base[k]; if (!Number.isFinite(x) || x <= 0 || x > 1000000) fail('培养数据无效'); base[k] = x; }
      return { id:h.id, lv:h.lv, star:h.star, base, eq, skills:h.skills.slice() };
    });
    return {kind:'sh-pvp',v:this.RULE,owner:raw.owner,name:raw.name.trim(),mode:raw.mode,team};
  },
  snapshot() {
    const p = this.init();
    return this.validate({kind:'sh-pvp',v:this.RULE,owner:p.owner,name:p.name,mode:G.mode,team:p.cells.map(id => {
      const h = G.heroes[id]; if (!h) throw Error('先上满九位将领');
      return {id,lv:h.lv,star:h.star,base:h.base,eq:SLOTS.map(sl => (p.gear[id] || {})[sl] || null),skills:h.owned.slice()};
    })});
  },
  encode(s) { return this.PREFIX + b64enc(new TextEncoder().encode(JSON.stringify(this.validate(s)))); },
  decode(code) {
    if (typeof code !== 'string' || code.length > 64000) throw Error('对战码过长');
    code = code.replace(/\s/g,'');
    if (!code.startsWith(this.PREFIX) || code.length > 32000) throw Error('请粘贴完整的水浒 PVP 对战码（SHP1:）');
    try { return this.validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b64dec(code.slice(this.PREFIX.length))))); }
    catch(e) { throw Error('对战码损坏或不兼容：' + e.message); }
  },
  async identity(s) {
    s = this.validate(s);
    const bytes = new TextEncoder().encode(JSON.stringify({v:s.v,owner:s.owner,mode:s.mode,team:s.team}));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  },
  hero(h) { return {hid:h.id,lv:h.lv,star:h.star,base:h.base,hurt:{lv:0,rest:0},owned:h.skills,equipment:Object.fromEntries(SLOTS.map((sl,i)=>[sl,h.eq[i]]))}; },
  units(s, ally) {
    const team = s.team.map(h=>h.id);
    return s.team.map((h,i) => { const hero = this.hero(h); return Battle.unit(h.id,Stats.calc(h.id,{hero,team,skills:h.skills,neutral:true}),ally,i,hero); });
  },
  async create(foe) {
    const mine = this.snapshot(); foe = this.validate(foe);
    if (mine.owner === foe.owner) throw Error('不能挑战自己的对战码');
    const [mk,key] = await Promise.all([this.identity(mine),this.identity(foe)]);
    const b = {kind:'pvp',sid:'pvp',stage:{name:'PVP · '+foe.name},mine,opponent:foe,key,seed:(parseInt(mk.slice(0,8),16)^parseInt(key.slice(8,16),16))>>>0,
      allies:this.units(mine,true),foes:this.units(foe,false),round:0,over:false,win:null,log:[],events:[],theme:null};
    Battle.tagNames(b); b.log.push({c:'in',s:'PVP：双方满血无伤，宿星不生效，三十回合未决为平局。'});
    return b;
  },
  settle(b) {
    if (b.kind !== 'pvp' || !b.over || b.settled) return [];
    const p = this.init(), time=Date.now(), result=b.result==='draw'?'平':b.win?'胜':'败'; let reward=null;
    if (b.win && !Object.hasOwn(p.claimed,b.key)) {
      p.claimed[b.key]=true; reward=b.opponent.name+'的头颅'; p.heads.unshift({name:reward,time,key:b.key,opponent:b.opponent});
    }
    p.records.unshift({time,result,rounds:b.round,mine:b.mine,opponent:b.opponent,reward}); p.records=p.records.slice(0,100);
    b.settled=true; Save.write();
    return [{icon:reward?'首':'战',text:reward?'获得 '+reward:b.win?'这个阵容的头颅已领取':result==='平'?'三十回合未决，平局':'此战败退，再整阵容',c:''}];
  },
  equip(id,sl,eid) {
    this.clean(); const p=G.pvp;
    if (!p.cells.includes(id) || !SLOTS.includes(sl)) throw Error('请先选择阵上将领');
    if (eid) {
      if (!DB.equip(eid) || DB.equip(eid).slot!==sl) throw Error('装备槽位不符');
      let used=0; for (const n of p.cells.filter(Boolean)) for (const k of SLOTS) if ((n!==id || k!==sl) && (p.gear[n]||{})[k]===eid) used++;
      if (used >= (this.stock()[eid]||0)) throw Error('这类装备已全部用于 PVP，请先卸下再分配');
    }
    (p.gear[id] ||= {})[sl]=eid||null;
  },
};
window.PVP = PVP;
