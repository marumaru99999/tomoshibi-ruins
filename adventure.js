import {createCharacter, abilityCheck, attackRoll, applyDamage, heal, castSpell, deathSave, longRest, startTurn, removeEffectsBySource, resolveConcentration, perceivedLight, secondWind} from './rules.js?v=5';
import {SPELLS} from './content.js?v=5';

export const SAVE_VERSION = 1;
export const DEFAULT_PARTY = [
  {name:'ブラン', raceId:'hill_dwarf', classId:'fighter',backgroundId:'soldier'},
  {name:'ミラ', raceId:'lightfoot_halfling', classId:'rogue',backgroundId:'criminal'},
  {name:'セラ', raceId:'human', classId:'cleric',backgroundId:'acolyte'},
  {name:'リュン', raceId:'high_elf', classId:'wizard',backgroundId:'sage'}
];

const BASE_SCORES = {
  fighter:{str:15,dex:13,con:14,int:8,wis:12,cha:10},
  rogue:{str:8,dex:15,con:13,int:12,wis:10,cha:14},
  cleric:{str:13,dex:10,con:14,int:8,wis:15,cha:12},
  wizard:{str:8,dex:14,con:13,int:15,wis:12,cha:10}
};

const SCENES = {
  village:{title:'霧灯村', description:'古い灯台の火が消え、地下の鐘が夜ごと鳴る。村の長は、鐘楼の奥にある「暁の灯石」を持ち帰ってほしいと頼む。', map:'村 → 石畳の道 → 遺跡の門 → 鐘楼'},
  road:{title:'石畳の道', description:'森を抜ける古道が遺跡へ伸びる。道端には野営できる平地があり、遠くに崩れた門が見える。', map:'村 ━━ 現在地 ━━ 遺跡の門 → 鐘楼'},
  gate:{title:'遺跡の門', description:'門を守る二体の灰の番人が道をふさぐ。石碑には「火を分ける者のみ通す」と刻まれている。', map:'村 → 石畳の道 ━━ 現在地 ━━ 鐘楼'},
  combat:{title:'遺跡の門・戦闘', description:'灰の番人との戦い。四人の行動後に敵が行動する。', map:'村 → 石畳の道 ━━ 現在地 ━━ 鐘楼'},
  vault:{title:'鐘楼の間', description:'ひび割れた祭壇の上で灯石が淡く輝く。これを村へ持ち帰れば、灯台の火を戻せる。', map:'村 → 石畳の道 → 遺跡の門 ━━ 現在地'},
  return:{title:'帰路', description:'灯石を携えた一行は村へ戻る。夜が明け、霧の向こうに灯台が見えた。', map:'現在地 ━━ 石畳の道 → 遺跡の門 → 鐘楼'},
  victory:{title:'灯火の帰還', description:'灯台に再び火が灯る。村人たちは四人の名を覚え、地下の鐘は静かになった。冒険は成功だ。', map:'冒険達成'},
  defeat:{title:'冒険の終わり', description:'一行は戦い続けられなくなった。村は別の助けを待つことになる。新しい冒険を始められる。', map:'冒険終了'}
};

function clone(value){return JSON.parse(JSON.stringify(value));}
function roll(state){
  let x = state.rngState >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rngState = x >>> 0 || 2463534242;
  return (state.rngState >>> 0) / 4294967296;
}
function rngFor(state){return () => roll(state);}
function record(state,message,kind='story'){
  state.log.push({number:state.log.length+1,kind,message});
  if(state.log.length>100) state.log.shift();
  state.lastMessage=message;
}
function clearEndedConcentration(state,person){
  if(!person?.endedConcentration)return;
  const source=person.endedConcentration;
  state.party=state.party.map(member=>{
    const updated=removeEffectsBySource(member,source);
    if(updated.endedConcentration===source) updated.endedConcentration=null;
    return updated;
  });
  if(state.combat)state.combat.enemies=state.combat.enemies.map(enemy=>removeEffectsBySource(enemy,source));
}
function active(char){return Number(char.hp)>0 && !char.dead;}
function partyAlive(state){return state.party.some(active);}
function requireActor(state,index){
  const actor=state.party[index];
  if(!actor || !active(actor)) throw new Error('行動できる冒険者を選んでください。');
  return actor;
}
function skillSuccess(result){return Boolean(result.success ?? result.succeeded ?? result.passed);}
function scoreMessage(result){return `出目${result.roll ?? result.natural ?? '―'}、合計${result.total ?? '―'}`;}
function spellOutcome(result){
  const details=result.details||[];
  const damage=details.reduce((sum,item)=>sum+Number(item.damage||0),0);
  const healing=details.reduce((sum,item)=>sum+Number(item.healing||0),0);
  if(healing)return `${healing}点回復。`;
  if(damage)return `${damage}点のダメージ。`;
  if(details.some(item=>item.hit===false))return '攻撃は外れた。';
  if(details.some(item=>item.stable))return '対象は安定した。';
  if(details.some(item=>item.effect))return '効果が現れた。';
  return '';
}
function weaponFor(actor){
  if(actor.classId==='fighter') return 'longsword';
  if(actor.classId==='rogue') return 'rapier';
  if(actor.classId==='cleric') return 'mace';
  return 'dagger';
}
function nextPartyTurn(state){
  if(!state.combat) return;
  let i=state.combat.turn+1;
  while(i<state.party.length && !active(state.party[i])) i++;
  if(i<state.party.length){state.combat.turn=i;return;}
  enemyPhase(state);
}
function completeRound(state){
  if(state.scene!=='combat'||state.combat.pendingReaction)return;
  for(const [index,bonus] of Object.entries(state.combat.guards||{})) state.party[index].ac-=bonus;
  state.combat.guards={};
  for(let index=0;index<state.party.length;index++){
    const person=state.party[index];
    if(person.hp===0 && !person.stable && !person.dead){
      const result=deathSave(person,rngFor(state));
      state.party[index]=result.character;
      record(state,`${person.name}の死亡セーヴ：出目${result.roll}。${result.dead?'死亡した。':result.stable?'容体が安定した。':result.character.hp>0?'意識を取り戻した。':'まだ意識はない。'}`,'combat');
    }
  }
  state.combat.round++;
  state.party=state.party.map(person=>startTurn(person));
  state.combat.turn=state.party.findIndex(active);
}
function applyEnemyHit(state,enemyIndex,targetIndex,natural,total){
  const enemy=state.combat.enemies[enemyIndex],person=state.party[targetIndex];
  const defense=effectiveAc(person);
  if(natural!==20 && total<defense){
    record(state,`${person.name}のシールドが${enemy.name}の攻撃を防いだ（出目${natural}、合計${total}）。`,'combat');
    return;
  }
  const damage=2+Math.floor(roll(state)*6);
  state.party[targetIndex]=applyDamage(person,damage,'bludgeoning');
  if(state.party[targetIndex].pendingConcentrationDc){
    const concentration=resolveConcentration(state.party[targetIndex],rngFor(state));
    state.party[targetIndex]=concentration.character;
    record(state,`${person.name}の集中維持は${concentration.check.success?'成功':'失敗'}（出目${concentration.check.roll}、DC${concentration.check.dc}）。`,'check');
  }
  clearEndedConcentration(state,state.party[targetIndex]);
  record(state,`${enemy.name}の攻撃が${person.name}に命中。${damage}点のダメージ。`,'combat');
}
function enemyPhase(state,start=0){
  for(let index=start;index<state.combat.enemies.length;index++){
    const enemy=state.combat.enemies[index];
    if(enemy.hp<=0 || !partyAlive(state)) continue;
    if((enemy.effects||[]).some(effect=>effect.id==='command_halt')){
      enemy.effects=enemy.effects.filter(effect=>effect.id!=='command_halt');
      record(state,`${enemy.name}は命令に従い、この手番は動けなかった。`,'combat');
      continue;
    }
    const alive=state.party.map((person,index)=>({person,index})).filter(({person})=>active(person));
    const target=alive[Math.floor(roll(state)*alive.length)];
    const natural=1+Math.floor(roll(state)*20);
    const total=natural+3;
    const ac=effectiveAc(target.person);
    if(natural===20 || (natural!==1 && total>=ac)){
      if(target.person.reactionAvailable && (target.person.slots?.[1]||0)>0 && target.person.preparedSpells?.includes('shield') && !(target.person.effects||[]).some(effect=>effect.id==='shield')){
        state.combat.pendingReaction={enemyIndex:index,targetIndex:target.index,natural,total};
        record(state,`${enemy.name}の攻撃が${target.person.name}に命中しそうだ。シールドを使うか選んでください。`,'combat');
        return;
      }
      applyEnemyHit(state,index,target.index,natural,total);
    }else record(state,`${enemy.name}の攻撃は${target.person.name}に届かなかった（出目${natural}、合計${total}）。`,'combat');
  }
  if(!partyAlive(state)){
    state.scene='defeat';state.combat=null;
    record(state,'一行は戦闘不能になった。冒険はここで終わる。','ending');
  }else completeRound(state);
}
function effectiveAc(person){
  const effects=person.effects||[];
  const mageArmor=effects.some(effect=>effect.id==='mage_armor')&&person.armor==='none';
  const base=mageArmor?Math.max(person.ac||10,13+Math.floor(((person.abilities?.dex||10)-10)/2)):Number(person.ac||10);
  return base+(effects.some(effect=>effect.id==='shield')?5:0)+(effects.some(effect=>effect.id==='shield_of_faith')?2:0);
}
function startCombat(state){
  state.scene='combat';
  state.combat={round:1,turn:state.party.findIndex(active),enemies:[
    {id:'sentinel_a',name:'灰の番人・甲',hp:8,maxHp:8,ac:11,scores:{str:12,dex:10,con:12,int:5,wis:10,cha:5},traits:[]},
    {id:'sentinel_b',name:'灰の番人・乙',hp:8,maxHp:8,ac:11,scores:{str:12,dex:10,con:12,int:5,wis:10,cha:5},traits:[]}
  ]};
  record(state,'灰の番人が動き出した。四人の手番の後に敵が行動する。','combat');
}
function finishCombatIfWon(state){
  if(state.combat && state.combat.enemies.every(enemy=>enemy.hp<=0)){
    state.combat=null;state.scene='vault';state.flags.gatePassed=true;
    record(state,'番人は崩れ、鐘楼への道が開いた。','combat');
    return true;
  }
  return false;
}

export function createGame(partySpecs=DEFAULT_PARTY,seed=Date.now()){
  if(!Array.isArray(partySpecs)||partySpecs.length!==4) throw new Error('冒険者を四人作成してください。');
  const party=partySpecs.map((spec,index)=>createCharacter({
    name:String(spec.name||`冒険者${index+1}`).slice(0,20),
    raceId:spec.raceId,
    classId:spec.classId,
    baseScores:spec.baseScores||BASE_SCORES[spec.classId],
    backgroundId:spec.backgroundId||'acolyte',choices:{id:`ally_${index}`}
  }));
  return {saveVersion:SAVE_VERSION,id:globalThis.crypto?.randomUUID?.()||`game-${Date.now()}`,
    revision:0,rngState:(Number(seed)>>>0)||2463534242,scene:'village',party,
    flags:{heardElder:false,scouted:false,gatePassed:false,stone:false},
    time:0,torchUntil:0,supplies:{potions:2,torches:2},rewards:{gold:0,xpEach:0},combat:null,log:[{number:1,kind:'story',message:'霧灯村に四人の冒険者が集まった。'}],
    lastMessage:'霧灯村に四人の冒険者が集まった。',processedIds:[]};
}

export function validateGame(state){
  if(!state||state.saveVersion!==SAVE_VERSION||!Array.isArray(state.party)||state.party.length!==4||!SCENES[state.scene]) throw new Error('この保存データは読み込めません。形式または版を確認してください。');
  if(!Number.isInteger(state.revision)||state.revision<0||!Number.isInteger(state.rngState)) throw new Error('保存データの数値が壊れています。');
  if(!state.flags||!state.supplies||!Array.isArray(state.log)||!Array.isArray(state.processedIds)||!Number.isFinite(state.time))throw new Error('保存データの必須項目がありません。');
  if(state.party.some(person=>!person||typeof person.name!=='string'||!Number.isFinite(person.hp)||!Number.isFinite(person.maxHp)||!person.abilities||!person.classId||!person.raceId))throw new Error('冒険者の保存データが壊れています。');
  if(state.scene==='combat'&&(!state.combat||!Array.isArray(state.combat.enemies)||!Number.isInteger(state.combat.turn)))throw new Error('戦闘の保存データが壊れています。');
  return true;
}

export function actionsFor(state){
  if(state.combat?.pendingReaction)return [
    {type:'use_shield',label:'シールドを使う（呪文枠とリアクションを消費）'},
    {type:'decline_shield',label:'シールドを使わず受ける'}];
  switch(state.scene){
    case 'village': return [
      {type:'talk',label:'村の長から話を聞く'},
      {type:'depart',label:'遺跡へ出発する'}];
    case 'road': return [
      {type:'scout',label:'道を調べる（知覚判定）',actor:true},
      ...(state.time>=state.torchUntil&&state.supplies.torches>0?[{type:'light_torch',label:'松明を灯す（1時間）'}]:[]),
      {type:'rest',label:'野営して大休憩する'},
      {type:'gate',label:'遺跡の門へ進む'},
      ...(state.flags.stone?[{type:'return',label:'灯石を持って村へ戻る'}]:[])];
    case 'gate': return [
      {type:'inspect',label:'石碑を調べる（知力判定）',actor:true},
      ...(state.time>=state.torchUntil&&state.supplies.torches>0?[{type:'light_torch',label:'松明を灯す（1時間）'}]:[]),
      {type:'negotiate',label:'番人に火を分けると説く（魅力判定）',actor:true},
      {type:'sneak',label:'脇道から忍び込む（敏捷判定）',actor:true},
      {type:'fight',label:'番人と戦う'},
      {type:'back',label:'道へ戻る'}];
    case 'combat': return [
      {type:'attack',label:'武器で攻撃',enemy:true},
      {type:'spell',label:'呪文を使う',spell:true,target:true},
      ...(state.party[state.combat.turn]?.classId==='fighter'&&state.party[state.combat.turn]?.resources?.secondWind?[{type:'second_wind',label:'セカンド・ウィンドで自分を回復（続けて行動可）'}]:[]),
      {type:'guard',label:'身を守る'},
      {type:'potion',label:'回復薬を使う',ally:true},
      {type:'flee',label:'一行で撤退を試みる'}];
    case 'vault': return [{type:'claim',label:'灯石を受け取る'}, {type:'gate',label:'門へ戻る'}];
    case 'return': return [{type:'finish',label:'灯台に灯石を納めて冒険を終える'}];
    default:return [];
  }
}

export function viewGame(state){
  validateGame(state);
  const scene=state.scene==='combat'?{title:'遺跡の門・戦闘',description:'灰の番人との戦い。四人の行動後に敵が行動する。',map:SCENES.gate.map}:SCENES[state.scene];
  return {id:state.id,revision:state.revision,scene:state.scene,...scene,
    party:state.party,enemies:state.combat?.enemies||[],turn:state.combat?.pendingReaction?.targetIndex??state.combat?.turn??null,round:state.combat?.round??null,
    actions:actionsFor(state),reactionTarget:state.combat?.pendingReaction?state.party[state.combat.pendingReaction.targetIndex]?.name:null,
    flags:{heardElder:state.flags.heardElder,scouted:state.flags.scouted,stone:state.flags.stone},
    supplies:state.supplies,rewards:state.rewards,time:state.time,torchLit:state.time<state.torchUntil,log:state.log.slice(-16),lastMessage:state.lastMessage};
}

export function perform(original,action){
  validateGame(original);
  if(!action||typeof action.type!=='string') throw new Error('行動を選んでください。');
  if(action.id && original.processedIds.includes(action.id)) return clone(original);
  if(!actionsFor(original).some(option=>option.type===action.type)) throw new Error('この場面ではその行動を選べません。');
  const state=clone(original), rng=rngFor(state), type=action.type;
  const actorIndex=Number.isInteger(action.actor)?action.actor:0;
  let result;
  if(type==='use_shield'||type==='decline_shield'){
    const pending=state.combat.pendingReaction;
    if(!pending)throw new Error('反応の選択待ちではありません。');
    const person=state.party[pending.targetIndex];
    if(type==='use_shield'){
      if(!person.reactionAvailable||!person.slots?.[1]||!person.preparedSpells?.includes('shield'))throw new Error('シールドを使えません。');
      person.slots[1]--;person.reactionAvailable=false;
      person.effects=[...(person.effects||[]),{id:'shield',source:'shield',duration:'next_turn'}];
      record(state,`${person.name}がシールドを発動。防御を5高めた。`,'combat');
    }
    state.combat.pendingReaction=null;
    applyEnemyHit(state,pending.enemyIndex,pending.targetIndex,pending.natural,pending.total);
    if(state.scene==='combat')enemyPhase(state,pending.enemyIndex+1);
  }else if(type==='talk'){
    state.flags.heardElder=true;
    record(state,'村の長は「石碑の言葉を読み、火を分ける意思を示せ」と教えた。番人は侵入者より、灯を忘れた者を警戒しているという。');
  }else if(type==='depart'){
    state.scene='road';state.time+=30;
    record(state,'一行は石畳の道を進んだ。野営地を確かめ、遺跡の門が見えるところまで来た。');
  }else if(type==='scout'){
    const actor=requireActor(state,actorIndex);
    const dim=state.time>=state.torchUntil&&perceivedLight(actor,'dim',30)==='dim';
    result=abilityCheck(actor,'wis',12,rng,{skill:'perception',disadvantage:dim});
    state.flags.scouted=state.flags.scouted||skillSuccess(result);state.time+=10;
    record(state,`${actor.name}が道を調べた（${scoreMessage(result)}${dim?'、薄暗さで不利':''}）。${skillSuccess(result)?'番人の巡回と、門の横に小道を見つけた。':'痕跡は見つからなかったが、道は門へ続いている。'}`,'check');
  }else if(type==='light_torch'){
    if(state.supplies.torches<1)throw new Error('松明が残っていません。');
    state.supplies.torches--;state.time++;state.torchUntil=state.time+60;
    record(state,'松明を灯した。今から1時間、周囲を明るく照らす。','story');
  }else if(type==='rest'){
    state.party=state.party.map(person=>longRest(person));state.time+=480;
    record(state,'一行は野営して大休憩した。HPと使用可能な呪文を回復した。','rest');
  }else if(type==='gate'){
    state.scene='gate';state.time+=15;
    record(state,'一行は崩れた門へ進んだ。二体の番人がこちらを見ている。');
  }else if(type==='back'){
    state.scene='road';state.time+=15;record(state,'一行は石畳の道へ引き返した。');
  }else if(type==='inspect'){
    const actor=requireActor(state,actorIndex);
    result=abilityCheck(actor,'int',12,rng,{skill:'history',stonework:true});state.time+=10;
    if(skillSuccess(result)) state.flags.inscription=true;
    record(state,`${actor.name}が石碑を調べた（${scoreMessage(result)}）。${skillSuccess(result)?'古い文の意味が分かった。「灯は奪うものではなく、分けるもの」だ。交渉の助けになる。':'文字は読めない。それでも門で話を試すことはできる。'}`,'check');
  }else if(type==='negotiate'){
    const actor=requireActor(state,actorIndex);
    result=abilityCheck(actor,'cha',state.flags.inscription||state.flags.heardElder?11:14,rng,{skill:'persuasion'});
    state.time+=10;
    if(skillSuccess(result)){
      state.flags.gatePassed=true;state.scene='vault';
      record(state,`${actor.name}の言葉（${scoreMessage(result)}）に番人が道を開けた。戦わずに鐘楼へ入れた。`,'check');
    }else{
      record(state,`${actor.name}の説得（${scoreMessage(result)}）は届かず、番人が武器を構えた。`,'check');
      startCombat(state);
    }
  }else if(type==='sneak'){
    const actor=requireActor(state,actorIndex);
    result=abilityCheck(actor,'dex',state.flags.scouted?12:15,rng,{skill:'stealth'});state.time+=10;
    if(skillSuccess(result)){
      state.flags.gatePassed=true;state.scene='vault';
      record(state,`${actor.name}が道を示し（${scoreMessage(result)}）、一行は番人を避けて鐘楼へ入った。`,'check');
    }else{
      record(state,`${actor.name}の足音（${scoreMessage(result)}）を番人が聞きつけた。`,'check');startCombat(state);
    }
  }else if(type==='fight'){
    startCombat(state);
  }else if(type==='attack'){
    const i=state.combat.turn,actor=requireActor(state,i);
    const target=state.combat.enemies.find(enemy=>enemy.id===action.target && enemy.hp>0);
    if(!target) throw new Error('攻撃対象を選んでください。');
    const guided=(target.effects||[]).some(effect=>effect.id==='guiding_bolt_advantage');
    result=attackRoll(actor,target,weaponFor(actor),rng,{advantage:guided,allyAdjacent:state.party.some((person,index)=>index!==i&&active(person))});
    if(guided)target.effects=target.effects.filter(effect=>effect.id!=='guiding_bolt_advantage');
    if(result.hit){
      const damage=Math.max(0,Number(result.damage||0));
      Object.assign(target,applyDamage(target,damage,result.damageType));
      record(state,`${actor.name}の攻撃が${target.name}に命中（出目${result.natural??result.roll??'―'}）。${damage}点のダメージ。`,'combat');
    }else record(state,`${actor.name}の攻撃は${target.name}に当たらなかった（出目${result.natural??result.roll??'―'}）。`,'combat');
    if(!finishCombatIfWon(state)) nextPartyTurn(state);
  }else if(type==='spell'){
    const i=state.combat.turn,actor=requireActor(state,i);
    if(!action.spellId) throw new Error('使う呪文を選んでください。');
    const spell=SPELLS[action.spellId];
    if(!spell) throw new Error('呪文が見つかりません。');
    let targets=[];
    const enemyEffects=['attack','save_damage','missiles','area_save_half','command'];
    const allyEffects=['heal','stabilize','guidance','resistance','shield_of_faith','sanctuary','mage_armor','light'];
    if(spell.effect==='area_save_half')targets=state.combat.enemies.filter(enemy=>enemy.hp>0);
    else if(spell.effect==='bless')targets=state.party.filter(active).slice(0,3);
    else if(enemyEffects.includes(spell.effect)){
      const enemy=state.combat.enemies.find(person=>person.id===action.target && person.hp>0);
      if(!enemy)throw new Error('呪文の対象となる番人を選んでください。');
      targets=[enemy];
    }else if(allyEffects.includes(spell.effect)){
      const index=Number(String(action.target).replace('ally_',''));
      if(!String(action.target).startsWith('ally_')||!state.party[index])throw new Error('呪文の対象となる仲間を選んでください。');
      targets=[state.party[index]];
    }
    result=castSpell(actor,action.spellId,targets,rng,{declaration:action.declaration});
    clearEndedConcentration(state,result.caster);
    state.party[i]=result.caster||actor;
    if(state.party[i].endedConcentration)state.party[i].endedConcentration=null;
    for(const updated of result.targets||[]){
      const enemyIndex=state.combat.enemies.findIndex(enemy=>enemy.id===updated.id);
      if(enemyIndex>=0){state.combat.enemies[enemyIndex]=updated;continue;}
      const allyIndex=state.party.findIndex(person=>person.id===updated.id);
      if(allyIndex>=0)state.party[allyIndex]=updated;
    }
    record(state,`${result.description||`${actor.name}が呪文を使った。`}${spellOutcome(result)}`,'combat');
    if(!finishCombatIfWon(state)&&spell.time!=='bonus') nextPartyTurn(state);
  }else if(type==='guard'){
    const actor=state.party[state.combat.turn];
    actor.ac=(actor.ac||10)+2;
    state.combat.guards||={};state.combat.guards[state.combat.turn]=2;
    record(state,`${actor.name}は身を守った。このラウンドの防御を高める。`,'combat');
    nextPartyTurn(state);
  }else if(type==='second_wind'){
    const i=state.combat.turn,actor=requireActor(state,i);
    state.party[i]=secondWind(actor,rng);
    record(state,`${actor.name}はセカンド・ウィンドでHPを回復した。続けて行動できる。`,'combat');
  }else if(type==='potion'){
    if(state.supplies.potions<=0) throw new Error('回復薬が残っていません。');
    const index=Number(action.ally);
    if(!Number.isInteger(index)||!state.party[index]||state.party[index].dead) throw new Error('回復する仲間を選んでください。');
    const amount=2+Math.floor(roll(state)*4)+1+Math.floor(roll(state)*4)+1;
    state.party[index]=heal(state.party[index],amount);
    state.supplies.potions--;
    record(state,`${state.party[state.combat.turn].name}が${state.party[index].name}に回復薬を使い、HPを${amount}点回復した。`,'combat');
    nextPartyTurn(state);
  }else if(type==='flee'){
    const actor=state.party[state.combat.turn];
    result=abilityCheck(actor,'dex',12,rng);
    if(skillSuccess(result)){
      state.scene='road';state.combat=null;state.time+=20;
      record(state,`${actor.name}が退路を開き（${scoreMessage(result)}）、一行は石畳の道へ撤退した。`,'combat');
    }else{
      record(state,`撤退の試みは失敗した（${scoreMessage(result)}）。`,'combat');nextPartyTurn(state);
    }
  }else if(type==='claim'){
    state.flags.stone=true;state.scene='road';state.time+=20;
    record(state,'灯石を受け取った。温かな光が一行を照らす。あとは村へ戻るだけだ。');
  }else if(type==='return'){
    if(!state.flags.stone) throw new Error('灯石を持っていません。');
    state.scene='return';state.time+=30;record(state,'一行は灯石を携えて霧灯村へ帰った。');
  }else if(type==='finish'){
    state.scene='victory';state.rewards={gold:60,xpEach:100};
    record(state,'灯石を灯台に納めた。村の夜は再び明るくなった。報酬は60金貨、経験値は一人100。冒険達成！','ending');
  }
  state.revision++;
  if(action.id) state.processedIds=[...state.processedIds.slice(-31),action.id];
  return state;
}
