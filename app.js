import {RACES,CLASSES,BACKGROUNDS,SPELLS} from './content.js?v=5';
import {createGame,DEFAULT_PARTY,validateGame,viewGame,perform} from './adventure.js?v=5';

const SAVE_KEY='tomoshibi-ruins-save-v1';
const app=document.querySelector('#app');
const toast=document.querySelector('#toast');
let game=null,menuOpen=false,busy=false;

function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function label(value,id){return escapeHTML(value?.nameJa||value?.name||value?.label||id);}
function notify(message){toast.textContent=message;toast.classList.add('visible');setTimeout(()=>toast.classList.remove('visible'),4000);}
function save(){
  if(!game)return;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(game));}
  catch(error){notify('保存できませんでした。空き容量を確認し、設定から保存ファイルを書き出してください。');}
}
function load(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;const state=JSON.parse(raw);validateGame(state);return state;}
  catch(error){notify('保存データを読めません。設定からバックアップを読み込むか、新しく始めてください。');return null;}
}
function downloadSave(){
  if(!game)return;
  const blob=new Blob([JSON.stringify(game,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download='灯火の遺跡_セーブ.json';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importSave(file){
  if(!file)return;
  try{
    const candidate=JSON.parse(await file.text());validateGame(candidate);
    if(!confirm('今の冒険を読み込んだデータに置き換えますか？ 現在の状態が必要なら先に保存ファイルを書き出してください。'))return;
    game=candidate;save();menuOpen=false;render();notify('保存データを読み込みました。');
  }catch(error){notify(error?.message||'保存ファイルを読み込めませんでした。');}
}
function setupScreen(){
  const races=Object.entries(RACES).map(([id,value])=>`<option value="${escapeHTML(id)}">${label(value,id)}</option>`).join('');
  const classes=Object.entries(CLASSES).map(([id,value])=>`<option value="${escapeHTML(id)}">${label(value,id)}</option>`).join('');
  const backgrounds=Object.entries(BACKGROUNDS).map(([id,value])=>`<option value="${escapeHTML(id)}">${label(value,id)}</option>`).join('');
  app.innerHTML=`<section class="hero"><div class="eyebrow">オフラインで遊べる短編RPG</div><h1>灯火の遺跡</h1><p>四人の冒険者を導き、消えた灯台の火を取り戻そう。選んだ種族と職業が判定や戦いに影響する。セーブはこの端末に自動で残る。</p></section>
    <section class="panel setup"><div class="section-title"><span>01</span><h2>四人の冒険者を作る</h2></div><p class="muted">最初はおすすめの組み合わせが入っています。名前・種族・職業は自由に変更できます。</p>
    <form id="setup-form">${DEFAULT_PARTY.map((person,i)=>`<fieldset class="creator"><legend>冒険者 ${i+1}</legend><label>名前<input name="name${i}" maxlength="20" required value="${escapeHTML(person.name)}"></label><label>種族<select name="race${i}">${races}</select></label><label>職業<select name="class${i}">${classes}</select></label><label>背景<select name="background${i}">${backgrounds}</select></label></fieldset>`).join('')}
    <button class="primary full" type="submit">冒険を始める <span aria-hidden="true">→</span></button></form></section>
    <section class="panel note"><h2>遊び方</h2><p>場面ごとに行動を選ぶだけで進みます。攻撃や判定の出目は記録に残ります。交渉でも戦闘でも、灯石を持ち帰ればクリアです。</p></section>`;
  DEFAULT_PARTY.forEach((person,i)=>{
    app.querySelector(`[name="race${i}"]`).value=person.raceId;
    app.querySelector(`[name="class${i}"]`).value=person.classId;
    app.querySelector(`[name="background${i}"]`).value=person.backgroundId;
  });
  app.querySelector('#setup-form').addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);
    const party=DEFAULT_PARTY.map((_,i)=>({name:String(data.get(`name${i}`)).trim(),raceId:data.get(`race${i}`),classId:data.get(`class${i}`),backgroundId:data.get(`background${i}`)}));
    if(party.some(person=>!person.name)){notify('四人の名前を入力してください。');return;}
    try{game=createGame(party);save();render();window.scrollTo(0,0);}catch(error){notify(error?.message||'作成できませんでした。');}
  });
  if(menuOpen){app.insertAdjacentHTML('beforeend',menuHTML());bindMenu();}
}
function partyCard(person,index,turn){
  const hp=Math.max(0,Number(person.hp||0)),max=Math.max(1,Number(person.maxHp||1));
  const race=RACES[person.raceId],profession=CLASSES[person.classId];
  const slots=person.slots?.[1]??0,maxSlots=person.maxSlots?.[1]??0;
  return `<div class="member ${turn===index?'current':''} ${hp===0?'down':''}">
    <div class="member-head"><div><strong>${escapeHTML(person.name)}</strong><small>${label(race,person.raceId)} · ${label(profession,person.classId)}</small></div><span class="level">レベル1</span></div>
    <div class="hp-row"><span>HP ${hp} / ${max}</span>${maxSlots?`<span>呪文枠 ${slots}/${maxSlots}</span>`:''}</div>
    <div class="hp-track"><span style="width:${Math.round(hp/max*100)}%"></span></div>
    ${turn===index?'<div class="turn-pill">この冒険者の手番</div>':''}
    <details class="member-details"><summary>能力と特性</summary><div>筋${person.abilities?.str} 敏${person.abilities?.dex} 耐${person.abilities?.con} 知${person.abilities?.int} 判${person.abilities?.wis} 魅${person.abilities?.cha}</div><div>${(person.traits||[]).map(id=>TRAIT_NAMES[id]).filter(Boolean).map(escapeHTML).join(' · ')}</div></details></div>`;
}
function selectOptions(entries){return entries.map(({value,text})=>`<option value="${escapeHTML(value)}">${escapeHTML(text)}</option>`).join('');}
const TRAIT_NAMES={dwarven_resilience:'毒に強い',dwarven_toughness:'最大HPが増える',dwarven_armor_speed:'重装鎧でも速度を保つ',stonecunning:'石造物の知識',keen_senses:'知覚に習熟',fey_ancestry:'魅了に強く、魔法では眠らない',trance:'トランス',high_elf_cantrip:'追加の初級呪文',lucky:'d20の1を振り直す',brave:'恐怖に強い',halfling_nimbleness:'大きい相手の場所を通過',naturally_stealthy:'大きい者に隠れやすい',extra_language:'追加言語',second_wind:'セカンド・ウィンド',sneak_attack:'急所攻撃',disciple_of_life:'回復呪文を強める',arcane_recovery:'秘術回復'};
function spellList(person){
  const playable=new Set(['fire_bolt','sacred_flame','magic_missile','guiding_bolt','burning_hands','thunderwave','cure_wounds','healing_word','spare_the_dying','bless','shield_of_faith','mage_armor','command']);
  return [...new Set([...(person.cantrips||[]),...(person.preparedSpells||[])])]
    .filter(id=>playable.has(id)&&['action','bonus'].includes(SPELLS[id]?.time))
    .filter(id=>person.turnSpell!=='bonus'||(SPELLS[id].level===0&&SPELLS[id].time==='action'));
}
function actionExtra(action,view){
  if(action.actor){
    return `<label class="action-field">行動する人<select class="actor-select">${selectOptions(view.party.map((person,index)=>({value:index,text:person.name})).filter((_,i)=>view.party[i].hp>0))}</select></label>`;
  }
  if(action.type==='attack')return `<label class="action-field">相手<select class="enemy-select">${selectOptions(view.enemies.filter(enemy=>enemy.hp>0).map(enemy=>({value:enemy.id,text:`${enemy.name} HP ${enemy.hp}`})))}</select></label>`;
  if(action.type==='spell'){
    const person=view.party[view.turn],spells=spellList(person);
    return `<label class="action-field">呪文<select class="spell-select">${selectOptions(spells.map(id=>({value:id,text:SPELLS[id].nameJa||SPELLS[id].name||id})))}</select></label><label class="action-field">対象<select class="target-select"></select></label><label class="action-field declaration-label">宣言<input class="declaration-input" placeholder="何を行うかを短く入力"></label><label class="action-field command-label">命令<select class="command-select">${selectOptions([{value:'halt',text:'止まれ'}])}</select></label>${spells.length?'':'<p class="muted">この人に使える呪文がありません。</p>'}`;
  }
  if(action.type==='potion')return `<label class="action-field">回復する仲間<select class="ally-select">${selectOptions(view.party.map((person,index)=>({value:index,text:`${person.name} HP ${person.hp}/${person.maxHp}`})))}</select></label>`;
  return '';
}
function menuHTML(){return `<div class="modal-backdrop" id="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="設定と保存"><div class="modal-head"><h2>設定と保存</h2><button class="quiet" id="close-menu" aria-label="閉じる">×</button></div>
  <p>行動するたびにこのiPhoneへ自動保存します。端末交換やSafariのデータ消去に備え、保存ファイルも書き出せます。</p>
  <div class="menu-actions"><button id="export-button">保存ファイルを書き出す</button><label class="import-label">保存ファイルを読み込む<input id="import-input" type="file" accept="application/json,.json"></label><button id="new-button">新しい冒険を始める</button><a class="menu-link" href="./credits.html">出典とライセンス</a></div>
  <details><summary>iPhoneでオフライン利用するには</summary><p>HTTPSで公開されたゲームのページをSafariで開き、共有ボタンから「ホーム画面に追加」を選びます。最初にオンラインで開いてキャッシュが完成すると、その後はオフラインで起動できます。初回の読み込みを終えてから機内モードで試してください。</p></details>
  <small>収録範囲：レベル1、四種族・四職業、短編冒険1本。ローカル保存。外部AIへの送信なし。</small></section></div>`;}
function gameScreen(){
  const view=viewGame(game);
  app.innerHTML=`<div class="game-layout"><section class="story panel"><div class="eyebrow">${view.scene==='combat'?`第${view.round}ラウンド`:'冒険'}</div><h1>${escapeHTML(view.title)}</h1><p class="story-text">${escapeHTML(view.description)}</p><div class="map">${escapeHTML(view.map)}</div>
    ${view.scene==='victory'?'<div class="quest done">✦ 灯台の火を戻した。冒険達成！</div>':view.flags.stone?'<div class="quest done">✦ 灯石を入手。村へ届けよう</div>':'<div class="quest">目標：灯石を見つけ、灯台へ持ち帰る</div>'}
    <div class="latest"><span>${view.reactionTarget?`${escapeHTML(view.reactionTarget)}の反応を選択`:'直前の出来事'}</span><p>${escapeHTML(view.lastMessage)}</p></div></section>
    <section class="party panel"><div class="section-title"><span>✦</span><h2>冒険者</h2></div><div class="party-grid">${view.party.map((person,index)=>partyCard(person,index,view.turn)).join('')}</div><div class="supplies">回復薬 ${view.supplies.potions}個 · 松明 ${view.supplies.torches}本${view.torchLit?'（点灯中）':''} · 経過 ${Math.floor(view.time/60)}時間${view.time%60}分</div></section>
    ${view.scene==='combat'?`<section class="enemies panel"><div class="section-title"><span>⚔</span><h2>相手</h2></div><div class="enemy-list">${view.enemies.map(enemy=>`<div class="enemy ${enemy.hp<=0?'fallen':''}"><strong>${escapeHTML(enemy.name)}</strong><span>HP ${enemy.hp}/${enemy.maxHp} · AC ${enemy.ac}</span></div>`).join('')}</div></section>`:''}
    <section class="actions panel"><div class="section-title"><span>→</span><h2>どうする？</h2></div>${view.actions.length?view.actions.map(option=>`<form class="action-form" data-type="${escapeHTML(option.type)}">${actionExtra(option,view)}<button type="submit" class="action-button" ${option.type==='spell'&&!spellList(view.party[view.turn]||{}).length?'disabled':''}><span>${escapeHTML(option.label)}</span><b aria-hidden="true">↗</b></button></form>`).join(''):`<p>${view.scene==='victory'?'冒険達成！ 設定から新しい冒険を始められます。':'冒険は終了しました。設定から新しい冒険を始められます。'}</p>`}</section>
    <section class="journal panel"><details><summary>判定と出来事の記録</summary><ol>${view.log.slice().reverse().map(entry=>`<li class="${escapeHTML(entry.kind)}">${escapeHTML(entry.message)}</li>`).join('')}</ol></details></section></div>${menuOpen?menuHTML():''}`;
  app.querySelectorAll('.action-form').forEach(form=>form.addEventListener('submit',onAction));
  app.querySelectorAll('.spell-select').forEach(select=>{
    const form=select.closest('form');
    select.addEventListener('change',()=>updateSpellForm(form,view));
    updateSpellForm(form,view);
  });
  if(menuOpen)bindMenu();
}
function updateSpellForm(form,view){
  const id=form.querySelector('.spell-select').value,effect=SPELLS[id]?.effect;
  const enemyEffects=['attack','save_damage','missiles','command'];
  const allyEffects=['heal','stabilize','guidance','resistance','shield_of_faith','sanctuary','mage_armor','light'];
  let targets=[];
  if(enemyEffects.includes(effect))targets=view.enemies.filter(enemy=>enemy.hp>0).map(enemy=>({value:enemy.id,text:enemy.name}));
  else if(allyEffects.includes(effect))targets=view.party.map((person,index)=>({value:`ally_${index}`,text:`${person.name} HP ${person.hp}/${person.maxHp}`}));
  else targets=[{value:'auto',text:effect==='area_save_half'?'敵全員':effect==='bless'?'仲間3人':'対象なし'}];
  form.querySelector('.target-select').innerHTML=selectOptions(targets);
  form.querySelector('.declaration-label').hidden=effect!=='utility';
  form.querySelector('.command-label').hidden=effect!=='command';
}
function onAction(event){
  event.preventDefault();if(busy||!game)return;
  busy=true;
  const form=event.currentTarget;
  const action={id:globalThis.crypto?.randomUUID?.()||String(Date.now()),type:form.dataset.type};
  if(form.querySelector('.actor-select'))action.actor=Number(form.querySelector('.actor-select').value);
  if(form.querySelector('.enemy-select'))action.target=form.querySelector('.enemy-select').value;
  if(form.querySelector('.spell-select')){action.spellId=form.querySelector('.spell-select').value;action.target=form.querySelector('.target-select').value;}
  if(form.querySelector('.declaration-label')&&!form.querySelector('.declaration-label').hidden)action.declaration=form.querySelector('.declaration-input').value.trim();
  if(form.querySelector('.command-label')&&!form.querySelector('.command-label').hidden)action.declaration=form.querySelector('.command-select').value;
  if(form.querySelector('.ally-select'))action.ally=Number(form.querySelector('.ally-select').value);
  try{game=perform(game,action);save();render();window.scrollTo({top:0,behavior:'smooth'});}
  catch(error){notify(error?.message||'行動できませんでした。');}
  finally{busy=false;}
}
function bindMenu(){
  app.querySelector('#close-menu').addEventListener('click',()=>{menuOpen=false;render();});
  app.querySelector('#modal-backdrop').addEventListener('click',event=>{if(event.target.id==='modal-backdrop'){menuOpen=false;render();}});
  app.querySelector('#export-button').addEventListener('click',downloadSave);
  app.querySelector('#import-input').addEventListener('change',event=>importSave(event.target.files?.[0]));
  app.querySelector('#new-button').addEventListener('click',()=>{
    if(!confirm('今の冒険を終了し、新しく作りますか？ 必要なら先に保存ファイルを書き出してください。'))return;
    game=null;localStorage.removeItem(SAVE_KEY);menuOpen=false;render();
  });
}
function render(){game?gameScreen():setupScreen();}
document.querySelector('#menu-button').addEventListener('click',()=>{menuOpen=!menuOpen;render();});
game=load();render();
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  navigator.serviceWorker.register('./sw.js').catch(()=>notify('オフライン準備に失敗しました。オンラインで再読み込みしてください。'));
}
