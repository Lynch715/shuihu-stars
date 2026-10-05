/* PVP 视图只读取状态，操作统一接入原事件委托。 */
const PVPView = {
  opponent:null, busy:false,
  title(t,sub='') { return sectionTitle(t,`<span class="tp">${esc(sub)}</span>`); },
  back:'<div class="btns"><div class="btn" data-action="go" data-id="pvp">回 PVP</div></div>',
  date(t) { return new Date(t).toLocaleString('zh-CN',{hour12:false}); },
  modal(body) { $('modal').innerHTML='<div class="sheet"><div class="pvp-modal-close"><div class="btn sm" data-action="modal-close">关闭</div></div>'+body+'</div>'; $('modal').classList.add('on'); },
  cards(team,editable=false) {
    return '<div class="pvp-grid">'+team.map((h,i)=>`${i%3===0?`<div class="pvp-row">${['前排','中排','后排'][i/3]}</div>`:''}<div class="hc ${h?QCLS[DB.hero(h.id).q]:''}" ${editable?`data-action="pvp-cell" data-i="${i}"`:''}>${h?`${seal(DB.hero(h.id).q)}${portraitOf(h.id)?porTag('por',h.id):'<div class="por">将</div>'}<div class="nm">${esc(DB.hero(h.id).name)}</div><div class="meta">Lv.${h.lv} · ${h.star}★</div><div class="tiny muted">${h.eq.filter(Boolean).length} 件装备</div>`:'<div class="por">空</div><div class="nm">点此上阵</div>'}</div>`).join('')+'</div>';
  },
  details(s) { return `<div class="card small">${esc(s.name)} · ${s.mode==='chaos'?'混乱':'传统'}</div>`+this.cards(s.team)+s.team.map(h=>`<div class="card small"><b>${esc(DB.hero(h.id).name)}</b><div>${h.eq.filter(Boolean).map(id=>esc(DB.equip(id).name)).join('、')||'无装备'}</div><div class="tiny muted">技能：${h.skills.map(id=>esc(DB.skill(id).name)).join('、')}</div></div>`).join(''); },
  own() { const p=G.pvp; return p.cells.map(id=>{const h=G.heroes[id];return h?{id,lv:h.lv,star:h.star,eq:SLOTS.map(sl=>(p.gear[id]||{})[sl]||null)}:null;}); },
  result(b,r) { return `<div class="frame result"><div class="rtitle ${b.win?'win':'lose'}">${b.result==='draw'?'平　局':b.win?'得　胜':'败　绩'}</div><div class="rsub">PVP · ${esc(b.opponent.name)} · ${b.round} 回合</div><div class="rlist">${r.map(ritemHtml).join('')}</div><div class="btns"><div class="btn main" data-action="go" data-id="pvp">回 PVP</div><div class="btn" data-action="go" data-id="pvp-records">战绩与战利品</div></div><div class="btns"><div class="btn" data-action="blog-modal">战报</div></div></div>`; },
  name() {const el=$('pvp-name');if (!el)return;const n=el.value.trim();if (!n||[...n].length>16||/[\u0000-\u001f]/.test(n))throw Error('姓名须为 1 至 16 个字');G.pvp.name=n;Save.write();},
  cell(i) {
    const id=G.pvp.cells[i];if(!id){this.select(i);return;}
    this.modal(this.title(DB.hero(id).name)+`<div class="btns"><div class="btn" data-action="pvp-change" data-i="${i}">换人／换位</div><div class="btn" data-action="pvp-remove" data-i="${i}">下阵</div></div>`+SLOTS.map(sl=>{const e=DB.equip((G.pvp.gear[id]||{})[sl]);return `<div class="card small" data-action="pvp-gear" data-id="${id}" data-slot="${sl}">${SLOT_NAME[sl]}：${e?esc(e.name):'空'}　<span class="muted">点击配装</span></div>`;}).join(''));
  },
  select(i) {this.modal(this.title('选择将领')+'<div class="small muted">选择已上阵将领可交换位置</div><div class="pvp-grid">'+Object.keys(G.heroes).filter(id=>DB.recruitPool.includes(id)).sort((a,b)=>Stats.heroPower(b)-Stats.heroPower(a)).map(id=>`<div class="card small" data-action="pvp-pick" data-id="${id}" data-i="${i}">${esc(DB.hero(id).name)}<div>Lv.${G.heroes[id].lv} · ${G.heroes[id].star}★ ${G.pvp.cells.includes(id)?'阵上':''}</div></div>`).join('')+'</div>');},
  gear(id,sl) {const stock=PVP.stock();this.modal(this.title(DB.hero(id).name+' · '+SLOT_NAME[sl])+`<div class="btns"><div class="btn" data-action="pvp-wear" data-id="${id}" data-slot="${sl}" data-eid="">卸下</div></div>`+Object.keys(stock).filter(e=>stock[e]>0&&DB.equip(e).slot===sl).map(e=>`<div class="card small" data-action="pvp-wear" data-id="${id}" data-slot="${sl}" data-eid="${e}">${seal(DB.equip(e).q)} ${esc(DB.equip(e).name)}<div class="tiny muted">拥有 ${stock[e]} 件 · PVP 已用 ${G.pvp.cells.filter(Boolean).filter(n=>(G.pvp.gear[n]||{})[sl]===e).length} 件</div></div>`).join(''));},
  async action(a,el) {
    const id=el.dataset.id,i=+el.dataset.i,sl=el.dataset.slot;
    try {
      if(a==='pvp-enter'){PVP.init();Save.write();go('pvp');}
      else if(a==='pvp-name'){this.name();toast('姓名已保存');}
      else if(a==='pvp-cell')this.cell(i);
      else if(a==='pvp-change')this.select(i);
      else if(a==='pvp-remove'){G.pvp.cells[i]=null;PVP.clean();closeModal();Save.write();render();}
      else if(a==='pvp-pick'){const p=G.pvp,j=p.cells.indexOf(id);if(j>=0)p.cells[j]=p.cells[i];p.cells[i]=id;PVP.clean();closeModal();Save.write();render();}
      else if(a==='pvp-gear')this.gear(id,sl);
      else if(a==='pvp-wear'){PVP.equip(id,sl,el.dataset.eid);Save.write();this.cell(G.pvp.cells.indexOf(id));render();}
      else if(a==='pvp-copy-team'){ask('复制闯关阵容','替换当前 PVP 站位和配装？','复制',()=>{G.pvp.cells=Array.from({length:9},(_,i)=>G.team[i]||null);G.pvp.gear=Object.fromEntries(G.pvp.cells.filter(Boolean).map(id=>[id,{...G.heroes[id].equipment}]));PVP.clean();Save.write();render();});}
      else if(a==='pvp-auto'){const p=G.pvp,ids=Object.keys(G.heroes).filter(id=>DB.recruitPool.includes(id)&&!p.cells.includes(id)).sort((a,b)=>Stats.heroPower(b)-Stats.heroPower(a));for(let j=0;j<9;j++)if(!p.cells[j])p.cells[j]=ids.shift()||null;PVP.clean();Save.write();render();if(p.cells.includes(null))toast('将领不足九人，先去招募');}
      else if(a==='pvp-code'){this.name();const code=await PVP.encode(PVP.snapshot());Save.write();this.modal(this.title('PVP 对战码')+`<div class="small muted">${esc(G.pvp.name)} · ${code.length} 字 · 固定阵容快照，培养或换装后请重新生成</div><textarea id="pvp-export" class="pvp-code" readonly>${esc(code)}</textarea><div class="btns"><div class="btn main" data-action="pvp-copy">复制对战码</div></div>`);}
      else if(a==='pvp-copy'){const e=$('pvp-export');e.select();try{await navigator.clipboard.writeText(e.value);toast('对战码已复制');}catch(x){toast(document.execCommand('copy')?'对战码已复制':'请长按文本框手动复制');}}
      else if(a==='pvp-challenge'){this.opponent=null;go('pvp-challenge');}
      else if(a==='pvp-preview'){const foe=await PVP.decode($('pvp-import').value);if(foe.owner===G.pvp.owner)throw Error('不能挑战自己的对战码');this.opponent=foe;go('pvp-preview');}
      else if(a==='pvp-fight'){
        if(this.busy||UI.playing)return;this.busy=true;
        try{const b=await PVP.create(this.opponent);UI.battle=b;UI.view='battle';UI.playing=true;UI.logFull=false;Play.tok++;Play.shown=0;render();Play.step();}finally{this.busy=false;}
      }
      else if(a==='pvp-record'){const r=G.pvp.records[i];this.modal(this.title('对战详情',r.result+' · '+r.rounds+' 回合')+`<div class="small muted">${esc(this.date(r.time))}${r.reward?' · '+esc(r.reward):''}</div>`+this.title('我方')+this.details(r.mine)+this.title('对方')+this.details(r.opponent));}
      else if(a==='pvp-head'){const h=G.pvp.heads[i];this.modal(this.title(h.name)+`<div class="card small"><div>姓名：${esc(h.opponent.name)}</div><div>对战时间：${esc(this.date(h.time))}</div></div>`+this.details(h.opponent));}
    }catch(e){toast(e.message);}
  },
};
VIEWS.pvp=()=>{const p=G.pvp;return PVPView.title('PVP 对战','九宫论兵')+'<div class="card small">九人阵容迎战朋友的离线快照。仅挑战方记录战果，胜利可收藏头颅。</div>'+`<div class="stat3"><div><b>${p.cells.filter(Boolean).length}/9</b><i>上阵</i></div><div><b>${p.records.filter(r=>r.result==='胜').length}</b><i>近百条胜绩</i></div><div><b>${p.heads.length}</b><i>头颅</i></div></div><div class="btns"><div class="btn main" data-action="go" data-id="pvp-form">创建／调整阵容</div><div class="btn" data-action="pvp-code">生成对战码</div></div><div class="btns"><div class="btn main" data-action="pvp-challenge">开始对战</div><div class="btn" data-action="go" data-id="pvp-records">战绩与战利品</div></div><div class="btns"><div class="btn" data-action="go" data-id="main">回大帐</div></div>`;};
VIEWS['pvp-form']=()=>PVPView.title('PVP 阵容',G.mode==='chaos'?'混乱':'传统')+`<div class="card small"><label for="pvp-name">玩家姓名</label><input id="pvp-name" class="pvp-input" maxlength="32" value="${esc(G.pvp.name)}" placeholder="请输入姓名，最多 16 字"><div class="btns"><div class="btn sm" data-action="pvp-name">保存姓名</div></div><div class="tiny muted">站位与五槽配装独立，实际等级、星级、技能沿用培养结果。点击将领换人或配装。</div></div>`+PVPView.cards(PVPView.own(),true)+'<div class="btns"><div class="btn" data-action="pvp-copy-team">复制闯关阵容与配装</div><div class="btn" data-action="pvp-auto">补满阵容</div></div><div class="btns"><div class="btn main" data-action="pvp-code">生成对战码</div></div>'+PVPView.back;
VIEWS['pvp-challenge']=()=>PVPView.title('开始对战')+'<div class="small muted">粘贴水浒 PVP 对战码，先查看对手再开战。</div><textarea id="pvp-import" class="pvp-code" placeholder="SHP2:… / SHU2:…"></textarea><div class="btns"><div class="btn main" data-action="pvp-preview">查看对手</div></div>'+PVPView.back;
VIEWS['pvp-preview']=()=>PVPView.opponent?PVPView.title('对手阵容')+PVPView.details(PVPView.opponent)+'<div class="card small muted">使用你的当前 PVP 阵容。双方满血、无伤病，三十回合未决算平局。</div><div class="btns"><div class="btn main" data-action="pvp-fight">开战</div></div>'+PVPView.back:VIEWS['pvp-challenge']();
VIEWS['pvp-records']=()=>{
  const p=G.pvp;
  const loot='<div class="pvp-loot-grid">'+p.heads.map((h,i)=>`<button type="button" class="pvp-trophy" data-action="pvp-head" data-i="${i}" aria-label="查看${esc(h.name)}"><img src="${esc(window.PVP_HEAD_ICON)}" alt="头颅" loading="lazy" decoding="async"><span>${esc(h.opponent.name)}</span></button>`).join('')+'</div>';
  return section('pvp-loot','战利品',p.heads.length?loot:'<div class="empty">尚未收获头颅</div>',`<span class="tp">${p.heads.length} 颗头颅 · ${G.fold['pvp-loot']?'展开':'收起'}</span>`)
    +PVPView.title('对战记录','最近 100 条 · 同阵容保留最新')
    +(p.records.map((r,i)=>`<div class="card small" data-action="pvp-record" data-i="${i}"><b>${esc(r.opponent.name)}</b>　${r.result} · ${r.rounds} 回合<div class="tiny muted">${esc(PVPView.date(r.time))}${r.reward?' · '+esc(r.reward):''} · 点击查看双方阵容</div></div>`).join('')||'<div class="empty">尚无对战记录</div>')+PVPView.back;
};
document.addEventListener('change',e=>{if(e.target.id==='pvp-name'){try{PVPView.name();}catch(x){toast(x.message);}}});
window.PVPView=PVPView;
