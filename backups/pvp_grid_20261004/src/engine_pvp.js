/* 异步 PVP：独立快照、五槽装备数量校验、混乱技能与收藏。 */
const PVP = {
  PREFIX: 'SHP2:', DENSE: 'SHU2:', LEGACY: 'SHP1:', RULE: 1,
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
  async checksum(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0,4); },
  compactBase(index, lv) {
    const [base,step] = SH_PVP_CATALOG.growth[index];
    return Object.fromEntries(SH_PVP_CATALOG.keys.map((k,i)=>[k,base[i]+step[i]*(lv-1)]));
  },
  // SHP2 为 Base64URL；较大的混乱快照用 SHU2 的 14 位汉字编码，均不需要服务器。
  textCode(bytes) {
    const ascii = this.PREFIX + b64enc(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    if (ascii.length <= 200) return ascii;
    const frame = new Uint8Array(bytes.length+2);frame[0]=bytes.length>>>8;frame[1]=bytes.length&255;frame.set(bytes,2);
    let text=this.DENSE, value=0, count=0;
    for(const byte of frame){value=(value<<8)|byte;count+=8;while(count>=14){count-=14;text+=String.fromCharCode(0x4e00+((value>>>count)&16383));value&=(1<<count)-1;}}
    if(count)text+=String.fromCharCode(0x4e00+(value<<(14-count)));
    if(text.length>200)throw Error('这份非标准培养资料超过短码容量，请检查存档；阵容数据未被删减');
    return text;
  },
  bytesCode(code) {
    if(code.startsWith(this.PREFIX)) {
      const text=code.slice(this.PREFIX.length);
      if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)throw Error('短码字符无效');
      return b64dec(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
    }
    let value=0,count=0;const out=[];
    for(const c of code.slice(this.DENSE.length)){
      const n=c.charCodeAt(0)-0x4e00;if(n<0||n>=16384)throw Error('短码字符无效');
      value=(value<<14)|n;count+=14;while(count>=8){count-=8;out.push((value>>>count)&255);value&=(1<<count)-1;}
    }
    if(out.length<2)throw Error('短码不完整');const size=(out[0]<<8)|out[1],needed=size+2;
    const used=needed*8, supplied=(code.length-this.DENSE.length)*14;
    if(size>1024||out.length<needed||Math.ceil(used/14)!==code.length-this.DENSE.length||value||out.slice(needed).some(x=>x!==0))throw Error('短码长度或补位无效');
    return Uint8Array.from(out.slice(2,needed));
  },
  async encode(raw) {
    const s=this.validate(raw),cat=SH_PVP_CATALOG;
    const heroWidth=Math.ceil(Math.log2(cat.heroes.length)),gearWidths=cat.gear.map(ids=>Math.ceil(Math.log2(ids.length+1))),skillWidth=Math.ceil(Math.log2(cat.skills.length));
    const sparseBits=45+s.team.reduce((n,h)=>n+h.eq.reduce((v,id,i)=>v+(id===null?0:gearWidths[i]),0),0);
    const sparse=sparseBits<9*gearWidths.reduce((a,b)=>a+b,0),chaos=s.mode==='chaos';
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.owner);
    const name=new TextEncoder().encode(s.name),owner=uuid?Uint8Array.from(s.owner.replace(/-/g,'').match(/../g),x=>parseInt(x,16)):new TextEncoder().encode(s.owner);
    const header=new Uint8Array(3+(uuid?16:1+owner.length)+name.length);
    header.set([cat.v,(sparse?1:0)|(chaos?2:0)|(uuid?4:0),name.length]);
    let at=3;if(!uuid)header[at++]=owner.length;header.set(owner,at);at+=owner.length;header.set(name,at);
    const bits=[],put=(n,w)=>{for(let i=w-1;i>=0;i--)bits.push(Math.floor(n/2**i)%2);};
    for(const h of s.team){
      const index=cat.heroes.indexOf(h.id);if(index<0)throw Error('将领不在当前短码字典');
      put(index,heroWidth);put(h.lv-1,7);put(h.star-1,3);
      h.eq.forEach((id,i)=>{const n=id===null?-1:cat.gear[i].indexOf(id);if(id!==null&&n<0)throw Error('装备不在当前短码字典');if(sparse){put(id===null?0:1,1);if(id!==null)put(n,gearWidths[i]);}else put(n+1,gearWidths[i]);});
      if(chaos)for(const id of h.skills){const n=cat.skills.indexOf(id);if(n<0)throw Error('技能不在当前短码字典');put(n,skillWidth);}
      const base=this.compactBase(index,h.lv),mask=cat.keys.reduce((m,k,i)=>m|(h.base[k]!==base[k]?1<<i:0),0);
      put(mask?1:0,1);
      if(mask){put(mask,5);for(let i=0;i<5;i++)if(mask&(1<<i)){
        const n=h.base[cat.keys[i]],integer=Number.isInteger(n);put(integer?0:1,1);
        if(integer)put(n,20);else{const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,n);for(const byte of new Uint8Array(buffer))put(byte,8);}
      }}
    }
    const body=new Uint8Array(header.length+Math.ceil(bits.length/8));body.set(header);bits.forEach((b,i)=>body[header.length+(i>>>3)]|=b<<(7-i%8));
    const signed=new Uint8Array(body.length+4);signed.set(body);signed.set(await this.checksum(body),body.length);return this.textCode(signed);
  },
  async expand(bytes) {
    if(bytes.length<25||bytes.length>1024)throw Error('短码长度无效');
    const body=bytes.slice(0,-4),sum=await this.checksum(body);if(!sum.every((n,i)=>n===bytes[body.length+i]))throw Error('短码不完整或已损坏');
    const cat=SH_PVP_CATALOG;if(body[0]!==cat.v||body[1]>7||body[2]<1||body[2]>64)throw Error('短码字典版本或姓名无效');
    const sparse=!!(body[1]&1),chaos=!!(body[1]&2),uuid=!!(body[1]&4);let at=3,owner;
    if(uuid){const hex=Array.from(body.slice(at,at+16),x=>x.toString(16).padStart(2,'0')).join('');owner=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');at+=16;}
    else {const n=body[at++];if(n<16||n>64)throw Error('玩家身份长度无效');owner=new TextDecoder('utf-8',{fatal:true}).decode(body.slice(at,at+n));at+=n;}
    const name=new TextDecoder('utf-8',{fatal:true}).decode(body.slice(at,at+body[2]));at+=body[2];let pos=at*8;
    const get=w=>{if(pos+w>body.length*8)throw Error('短码阵容不全');let n=0;for(let i=0;i<w;i++,pos++)n=n*2+((body[pos>>>3]>>>(7-pos%8))&1);return n;};
    const hw=Math.ceil(Math.log2(cat.heroes.length)),gw=cat.gear.map(ids=>Math.ceil(Math.log2(ids.length+1))),sw=Math.ceil(Math.log2(cat.skills.length));
    const team=Array.from({length:9},()=>{
      const index=get(hw);if(index>=cat.heroes.length)throw Error('短码将领编号无效');const id=cat.heroes[index],lv=get(7)+1,star=get(3)+1;
      const eq=cat.gear.map((ids,i)=>{const n=sparse?(get(1)?get(gw[i])+1:0):get(gw[i]);if(n>ids.length)throw Error('短码装备编号无效');return n?ids[n-1]:null;});
      const skills=chaos?Array.from({length:Math.min(star,4)},()=>{const n=get(sw);if(n>=cat.skills.length)throw Error('短码技能编号无效');return cat.skills[n];}):cat.classic[index].slice(0,Math.min(star,4));
      const base=this.compactBase(index,lv);
      if(get(1)){const mask=get(5);if(!mask)throw Error('培养标志无效');for(let i=0;i<5;i++)if(mask&(1<<i)){if(get(1)){const buf=new ArrayBuffer(8),view=new Uint8Array(buf);for(let j=0;j<8;j++)view[j]=get(8);base[cat.keys[i]]=new DataView(buf).getFloat64(0);}else base[cat.keys[i]]=get(20);}}
      return {id,lv,star,eq,skills,base};
    });
    if(Math.ceil(pos/8)!==body.length||(pos%8&&(body[body.length-1]&((1<<(8-pos%8))-1))))throw Error('短码含多余资料');
    return this.validate({kind:'sh-pvp',v:this.RULE,owner,name,mode:chaos?'chaos':'classic',team});
  },
  async decode(code) {
    if(typeof code!=='string'||code.length>64000)throw Error('对战码过长');code=code.replace(/\s/g,'');
    const short=code.startsWith(this.PREFIX)||code.startsWith(this.DENSE),legacy=code.startsWith(this.LEGACY);
    if((!short&&!legacy)||code.length>(short?200:32000))throw Error('请粘贴完整的水浒 PVP 对战码');
    try{if(short)return await this.expand(this.bytesCode(code));return this.validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b64dec(code.slice(this.LEGACY.length)))));}
    catch(e){throw Error('对战码损坏或不兼容：'+e.message);}
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
