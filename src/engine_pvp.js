/* 异步 PVP：独立快照、五槽装备数量校验、混乱技能与收藏。
   对战码 SHP2 = 'SHP2:' + Base64URL(字典版本 + 标志 + 身份 + 姓名 + 位字段 + SHA-256 前 4 字节)。
   位宽固定写在字典 bits 里，字典只许追加，所以加人加装备不会弄废旧码。
   V10.9.3：字典 v2（位宽固化、兵器 8 位、坐骑 7 位）、新档身份 8 字节、只生成 Base64URL、
   战绩与头颅改存对战码。仍能解 v1 字典码、SHU2 汉字码和 SHP1 JSON 码，只是不再生成。 */
const PVP = {
  PREFIX: 'SHP2:', DENSE: 'SHU2:', LEGACY: 'SHP1:', RULE: 1, MAX: 360,
  // v1 字典与 v2 内容相同，只是位宽按当时列表长度算出来的；解旧码时套这组位宽
  V1BITS: { hero: 9, gear: [7, 7, 5, 6, 6], skill: 11 },
  newOwner() { return Array.from(crypto.getRandomValues(new Uint8Array(8)), x => x.toString(16).padStart(2, '0')).join(''); },
  init() {
    G.pvp ||= { owner: this.newOwner(), name: '', cells: Array(9).fill(null), gear: {}, claimed: {}, heads: [], records: [] };
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
    p.owner ||= this.newOwner(); p.gear ||= {}; p.claimed ||= {}; p.heads ||= []; p.records ||= [];
    p.records = this.uniqueRecords(p.records);
    const seen = new Set(), used = {}, stock = this.stock();
    p.cells = Array.from({length: 9}, (_, i) => { const id = (p.cells || [])[i]; if (!G.heroes[id] || seen.has(id)) return null; seen.add(id); return id; });
    for (const id of Object.keys(p.gear)) if (!seen.has(id)) delete p.gear[id];
    for (const id of p.cells.filter(Boolean)) for (const sl of SLOTS) {
      const gear = p.gear[id] ||= {}, e = gear[sl], data = DB.equip(e);
      if (!data || data.slot !== sl || (used[e] || 0) >= (stock[e] || 0)) gear[sl] = null;
      else used[e] = (used[e] || 0) + 1;
    }
  },
  /* ── 战绩与头颅：V10.9.3 起 mine / opponent 存对战码字符串，附 oname 给列表直接显示。
       旧档里是展开的快照对象，未迁移前照样能读；进 PVP 时 migrate() 一次性转成码。 */
  oname(e) { return e.oname != null ? e.oname : (e.opponent && typeof e.opponent === 'object' ? e.opponent.name : ''); },
  async foe(x) { return typeof x === 'string' ? await this.decode(x) : this.validate(x); },
  legacyKey(s) { return JSON.stringify({v:s.v,owner:s.owner,mode:s.mode,team:s.team.map(h=>({id:h.id,lv:h.lv,star:h.star,base:SH_PVP_CATALOG.keys.map(k=>h.base[k]),eq:h.eq,skills:h.skills}))}); },
  recordKey(r) { return r.key ? 'k:' + r.key : typeof r.opponent === 'string' ? 'c:' + r.opponent : 'j:' + this.legacyKey(r.opponent); },
  uniqueRecords(records) {
    const seen = new Set();
    return records.slice().sort((a,b)=>b.time-a.time).filter(r=>{
      const key=this.recordKey(r);if(seen.has(key))return false;seen.add(key);return true;
    }).slice(0,100);
  },
  pending() { const p = G.pvp; return !!p && (p.records.some(r => typeof r.mine !== 'string' || typeof r.opponent !== 'string' || !r.key) || p.heads.some(h => typeof h.opponent !== 'string')); },
  async migrate() {
    const p = this.init(); if (!this.pending()) return 0; let n = 0;
    const toCode = async x => typeof x === 'string' ? x : await this.encode(x);
    for (const r of p.records) {
      if (typeof r.mine === 'string' && typeof r.opponent === 'string' && r.key) continue;
      try {
        const foe = await this.foe(r.opponent);
        if (!r.key) r.key = await this.identity(foe);
        r.oname = foe.name; r.opponent = await toCode(foe); r.mine = await toCode(r.mine); n++;
      } catch (e) {}   // 转不了的原样留着，不删
    }
    for (const h of p.heads) {
      if (typeof h.opponent === 'string') continue;
      try { const foe = await this.foe(h.opponent); h.oname = foe.name; h.opponent = await toCode(foe); n++; } catch (e) {}
    }
    p.records = this.uniqueRecords(p.records); Save.write(); return n;
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
      if (raw.mode === 'classic' && JSON.stringify(h.skills) !== JSON.stringify(this.classicSkills(h.id, h.star))) fail('传统模式技能不符');
      if (raw.mode === 'chaos' && h.skills.some(id => !Chaos.all().includes(id))) fail('混乱技能不在技能池');
      const base = {};
      for (const k of GROW_KEYS) { const x = h.base && h.base[k]; if (!Number.isFinite(x) || x <= 0 || x > 1000000) fail('培养数据无效'); base[k] = x; }
      return { id:h.id, lv:h.lv, star:h.star, base, eq, skills:h.skills.slice() };
    });
    return {kind:'sh-pvp',v:this.RULE,owner:raw.owner,name:raw.name.trim(),mode:raw.mode,team};
  },
  classicSkills(id, star) { return (DB.hero(id).sk || []).slice(0, Math.min(star, 4)); },
  snapshot() {
    const p = this.init();
    return this.validate({kind:'sh-pvp',v:this.RULE,owner:p.owner,name:p.name,mode:G.mode,team:p.cells.map(id => {
      const h = G.heroes[id]; if (!h) throw Error('先上满九位将领');
      return {id,lv:h.lv,star:h.star,base:h.base,eq:SLOTS.map(sl => (p.gear[id] || {})[sl] || null),skills:h.owned.slice()};
    })});
  },
  async checksum(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0,4); },
  compactBase(index, lv) {
    const [base,step] = SH_PVP_CATALOG.growth[index];
    return Object.fromEntries(SH_PVP_CATALOG.keys.map((k,i)=>[k,base[i]+step[i]*(lv-1)]));
  },
  textCode(bytes) {
    const code = this.PREFIX + b64enc(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    if (code.length > this.MAX) throw Error('这份非标准培养资料超过对战码容量，请检查存档；阵容数据未被删减');
    return code;
  },
  bytesCode(code) {
    if(code.startsWith(this.PREFIX)) {
      const text=code.slice(this.PREFIX.length);
      if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)throw Error('短码字符无效');
      return b64dec(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
    }
    // SHU2 汉字码：V10.9.1–10.9.2 生成过，只解不生成
    let value=0,count=0;const out=[];
    for(const c of code.slice(this.DENSE.length)){
      const n=c.charCodeAt(0)-0x4e00;if(n<0||n>=16384)throw Error('短码字符无效');
      value=(value<<14)|n;count+=14;while(count>=8){count-=8;out.push((value>>>count)&255);value&=(1<<count)-1;}
    }
    if(out.length<2)throw Error('短码不完整');const size=(out[0]<<8)|out[1],needed=size+2;
    const used=needed*8;
    if(size>1024||out.length<needed||Math.ceil(used/14)!==code.length-this.DENSE.length||value||out.slice(needed).some(x=>x!==0))throw Error('短码长度或补位无效');
    return Uint8Array.from(out.slice(2,needed));
  },
  /* 身份三种写法：旧档 UUID 原样 16 字节（标志 4）；V10.9.3 起新档 16 位十六进制 8 字节（标志 8）；其他字符串带长度。 */
  async encode(raw) {
    const s=this.validate(raw),cat=SH_PVP_CATALOG,bits=cat.bits;
    const sparseBits=45+s.team.reduce((n,h)=>n+h.eq.reduce((v,id,i)=>v+(id===null?0:bits.gear[i]),0),0);
    const sparse=sparseBits<9*bits.gear.reduce((a,b)=>a+b,0),chaos=s.mode==='chaos';
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.owner),hex8=!uuid&&/^[0-9a-f]{16}$/.test(s.owner);
    const name=new TextEncoder().encode(s.name),owner=(uuid||hex8)?Uint8Array.from(s.owner.replace(/-/g,'').match(/../g),x=>parseInt(x,16)):new TextEncoder().encode(s.owner);
    const header=new Uint8Array(3+((uuid||hex8)?owner.length:1+owner.length)+name.length);
    header.set([cat.v,(sparse?1:0)|(chaos?2:0)|(uuid?4:0)|(hex8?8:0),name.length]);
    let at=3;if(!uuid&&!hex8)header[at++]=owner.length;header.set(owner,at);at+=owner.length;header.set(name,at);
    const put=(n,w)=>{if(n<0||n>=2**w)throw Error('字典容量不足，请升级字典版本');for(let i=w-1;i>=0;i--)bitsOut.push(Math.floor(n/2**i)%2);},bitsOut=[];
    for(const h of s.team){
      const index=cat.heroes.indexOf(h.id);if(index<0)throw Error('将领不在当前短码字典');
      put(index,bits.hero);put(h.lv-1,7);put(h.star-1,3);
      h.eq.forEach((id,i)=>{const n=id===null?-1:cat.gear[i].indexOf(id);if(id!==null&&n<0)throw Error('装备不在当前短码字典');if(sparse){put(id===null?0:1,1);if(id!==null)put(n,bits.gear[i]);}else put(n+1,bits.gear[i]);});
      if(chaos)for(const id of h.skills){const n=cat.skills.indexOf(id);if(n<0)throw Error('技能不在当前短码字典');put(n,bits.skill);}
      const base=this.compactBase(index,h.lv),mask=cat.keys.reduce((m,k,i)=>m|(h.base[k]!==base[k]?1<<i:0),0);
      put(mask?1:0,1);
      if(mask){put(mask,5);for(let i=0;i<5;i++)if(mask&(1<<i)){
        const n=h.base[cat.keys[i]],integer=Number.isInteger(n);put(integer?0:1,1);
        if(integer){
          // v2：写与模板的差值（zigzag），2 位档位 6/10/14 位，装不下才写 20 位绝对值。数据重平衡后的旧档每项省一半以上
          const d=n-base[cat.keys[i]],z=d<0?-2*d-1:2*d,cls=z<64?0:z<1024?1:z<16384?2:3;put(cls,2);
          if(cls===3)put(n,20);else put(z,[6,10,14][cls]);
        }else{const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,n);for(const byte of new Uint8Array(buffer))put(byte,8);}
      }}
    }
    const body=new Uint8Array(header.length+Math.ceil(bitsOut.length/8));body.set(header);bitsOut.forEach((b,i)=>body[header.length+(i>>>3)]|=b<<(7-i%8));
    const signed=new Uint8Array(body.length+4);signed.set(body);signed.set(await this.checksum(body),body.length);return this.textCode(signed);
  },
  async expand(bytes) {
    if(bytes.length<20||bytes.length>1024)throw Error('短码长度无效');
    const body=bytes.slice(0,-4),sum=await this.checksum(body);if(!sum.every((n,i)=>n===bytes[body.length+i]))throw Error('短码不完整或已损坏');
    const cat=SH_PVP_CATALOG,v=body[0];
    if(!(v===cat.v||v===1)||body[1]>15||body[2]<1||body[2]>64)throw Error('短码字典版本或姓名无效');
    const bits=v===cat.v?cat.bits:this.V1BITS;
    const sparse=!!(body[1]&1),chaos=!!(body[1]&2),uuid=!!(body[1]&4),hex8=!!(body[1]&8);if(uuid&&hex8)throw Error('身份标志无效');let at=3,owner;
    if(uuid||hex8){const n=uuid?16:8;const hex=Array.from(body.slice(at,at+n),x=>x.toString(16).padStart(2,'0')).join('');owner=uuid?[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'):hex;at+=n;}
    else {const n=body[at++];if(n<16||n>64)throw Error('玩家身份长度无效');owner=new TextDecoder('utf-8',{fatal:true}).decode(body.slice(at,at+n));at+=n;}
    const name=new TextDecoder('utf-8',{fatal:true}).decode(body.slice(at,at+body[2]));at+=body[2];let pos=at*8;
    const get=w=>{if(pos+w>body.length*8)throw Error('短码阵容不全');let n=0;for(let i=0;i<w;i++,pos++)n=n*2+((body[pos>>>3]>>>(7-pos%8))&1);return n;};
    const team=Array.from({length:9},()=>{
      const index=get(bits.hero);if(index>=cat.heroes.length)throw Error('短码将领编号无效');const id=cat.heroes[index],lv=get(7)+1,star=get(3)+1;
      const eq=cat.gear.map((ids,i)=>{const n=sparse?(get(1)?get(bits.gear[i])+1:0):get(bits.gear[i]);if(n>ids.length)throw Error('短码装备编号无效');return n?ids[n-1]:null;});
      const skills=chaos?Array.from({length:Math.min(star,4)},()=>{const n=get(bits.skill);if(n>=cat.skills.length)throw Error('短码技能编号无效');return cat.skills[n];}):this.classicSkills(id,star);
      const base=this.compactBase(index,lv);
      if(get(1)){const mask=get(5);if(!mask)throw Error('培养标志无效');for(let i=0;i<5;i++)if(mask&(1<<i)){
        if(get(1)){const buf=new ArrayBuffer(8),view=new Uint8Array(buf);for(let j=0;j<8;j++)view[j]=get(8);base[cat.keys[i]]=new DataView(buf).getFloat64(0);}
        else if(v===1)base[cat.keys[i]]=get(20);
        else{const cls=get(2);if(cls===3)base[cat.keys[i]]=get(20);else{const z=get([6,10,14][cls]);base[cat.keys[i]]+=(z%2?-(z+1)/2:z/2);}}
      }}
      return {id,lv,star,eq,skills,base};
    });
    if(Math.ceil(pos/8)!==body.length||(pos%8&&(body[body.length-1]&((1<<(8-pos%8))-1))))throw Error('短码含多余资料');
    return this.validate({kind:'sh-pvp',v:this.RULE,owner,name,mode:chaos?'chaos':'classic',team});
  },
  async decode(code) {
    if(typeof code!=='string'||code.length>64000)throw Error('对战码过长');code=code.replace(/\s/g,'');
    const short=code.startsWith(this.PREFIX)||code.startsWith(this.DENSE),legacy=code.startsWith(this.LEGACY);
    if((!short&&!legacy)||code.length>(short?this.MAX:32000))throw Error('请粘贴完整的水浒 PVP 对战码');
    try{if(short)return await this.expand(this.bytesCode(code));return this.validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b64dec(code.slice(this.LEGACY.length)))));}
    catch(e){throw Error('对战码损坏或不兼容：'+e.message);}
  },
  /* 奖励身份：不含姓名，不含字典版本（RULE 固定为 1），所以换码格式不影响已领头颅 */
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
    const [mk,key,mineCode,foeCode] = await Promise.all([this.identity(mine),this.identity(foe),this.encode(mine),this.encode(foe)]);
    const b = {kind:'pvp',sid:'pvp',stage:{name:'PVP · '+foe.name},mine,opponent:foe,mineCode,foeCode,key,seed:(parseInt(mk.slice(0,8),16)^parseInt(key.slice(8,16),16))>>>0,
      allies:this.units(mine,true),foes:this.units(foe,false),round:0,over:false,win:null,log:[],events:[],theme:null};
    Battle.tagNames(b); b.log.push({c:'in',s:'PVP：双方满血无伤，宿星不生效，三十回合未决为平局。'});
    return b;
  },
  settle(b) {
    if (b.kind !== 'pvp' || !b.over || b.settled) return [];
    const p = this.init(), time=Date.now(), result=b.result==='draw'?'平':b.win?'胜':'败'; let reward=null;
    if (b.win && !Object.hasOwn(p.claimed,b.key)) {
      p.claimed[b.key]=true; reward=b.opponent.name+'的头颅'; p.heads.unshift({name:reward,time,key:b.key,oname:b.opponent.name,opponent:b.foeCode});
    }
    p.records.unshift({time,result,rounds:b.round,key:b.key,oname:b.opponent.name,mine:b.mineCode,opponent:b.foeCode,reward}); p.records=this.uniqueRecords(p.records);
    b.settled=true; Save.write();
    return [{icon:reward?'首':'战',text:reward?'获得 '+reward:b.win?'这个阵容的头颅已领取':result==='平'?'三十回合未决，平局':'此战败退，再整阵容',c:''}];
  },
  autoEquip() {
    this.init(); const p = G.pvp, team = p.cells.filter(Boolean);
    if (!team.length) return { err: 'PVP 阵上没有人' };
    const before = JSON.stringify(p.gear);
    const { gear } = AutoGear.plan(team, this.stock(), { neutral: true });
    p.gear = gear;
    Save.write();
    return { changed: before !== JSON.stringify(gear), put: Object.values(gear).reduce((n, g) => n + SLOTS.filter(sl => g[sl]).length, 0) };
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
