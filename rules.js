// 数値と資源の確定処理。入力を変更せず、保存可能な通常のオブジェクトを返す。
import {ABILITIES, STANDARD_ARRAY, RACES, CLASSES, BACKGROUNDS, SKILL_ABILITIES, WEAPONS, SPELLS} from './content.js?v=5';

const copy = value => structuredClone(value);
const has = (actor, trait) => (actor.traits || []).includes(trait);
const random = rng => (typeof rng === 'function' ? rng : Math.random)();
export function die(sides, rng) {
  const value = random(rng);
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('乱数は0以上1未満');
  return Math.floor(value * sides) + 1;
}
export function rollDice(count, sides, rng) {
  return Array.from({length:count}, () => die(sides,rng)).reduce((a,b)=>a+b,0);
}
export const abilityModifier = score => Math.floor((score - 10) / 2);
export const proficiencyBonus = level => 2 + Math.floor((level - 1) / 4);
const score = (actor, ability) => actor.abilities?.[ability] ?? actor.scores?.[ability] ?? 10;
const mod = (actor, ability) => abilityModifier(score(actor, ability));
const prof = actor => actor.proficiencyBonus ?? proficiencyBonus(actor.level ?? 1);
const effectList = actor => Array.isArray(actor.effects) ? actor.effects : [];
const active = (actor, id) => effectList(actor).some(effect => effect.id === id);

// 同じ状態は原因別に保持する。有利と不利は個数に関係なく相殺する。
export function rollD20(rng, {advantage=false, disadvantage=false, lucky=false}={}) {
  const mode = advantage && disadvantage ? 0 : advantage ? 1 : disadvantage ? -1 : 0;
  const rolled = [];
  const draw = () => {
    let value = die(20,rng);
    rolled.push(value);
    if (lucky && value === 1) { value = die(20,rng); rolled.push(value); }
    return value;
  };
  const first = draw();
  const second = mode ? draw() : null;
  const roll = mode === 1 ? Math.max(first,second) : mode === -1 ? Math.min(first,second) : first;
  return {roll, rolls:rolled, advantage:mode===1, disadvantage:mode===-1};
}

function normalizedScores(baseScores, classId) {
  const allocation = {
    fighter:{str:15,con:14,dex:13,wis:12,int:10,cha:8},
    rogue:{dex:15,int:14,con:13,wis:12,cha:10,str:8},
    cleric:{wis:15,con:14,str:13,cha:12,dex:10,int:8},
    wizard:{int:15,con:14,dex:13,wis:12,cha:10,str:8},
  };
  const scores = baseScores ? {...baseScores} : allocation[classId];
  if (ABILITIES.some(a => !Number.isInteger(scores[a]) || scores[a] < 3 || scores[a] > 18)) throw new Error('能力値は各3〜18の整数');
  if (!baseScores && [...Object.values(scores)].sort((a,b)=>b-a).join() !== STANDARD_ARRAY.join()) throw new Error('標準配列が不正');
  return scores;
}
function unique(values) { return [...new Set(values)]; }
function chooseSkills(classData, background, choices) {
  const desired = choices.skills || classData.skillChoices.slice(0,classData.skillCount);
  if (desired.length !== classData.skillCount || new Set(desired).size !== desired.length || desired.some(s=>!classData.skillChoices.includes(s))) throw new Error('クラス技能の選択が不正');
  let skills = unique([...desired, ...background.skills]);
  const missing = desired.length + background.skills.length - skills.length;
  if (missing) {
    const replacements = choices.replacementSkills || Object.keys(SKILL_ABILITIES).filter(s=>!skills.includes(s)).slice(0,missing);
    if (replacements.length !== missing || replacements.some(s=>!SKILL_ABILITIES[s] || skills.includes(s))) throw new Error('重複技能の選択が不正');
    skills = [...skills,...replacements];
  }
  if (classData.name === 'ローグ') {
    const expertise = choices.expertise || skills.slice(0,2);
    if (expertise.length !== 2 || new Set(expertise).size !== 2 || expertise.some(s=>!skills.includes(s))) throw new Error('習熟強化は習熟した2技能');
    return {skills, expertise};
  }
  return {skills, expertise:[]};
}
function spellChoices(classId, choices) {
  if (!['wizard','cleric'].includes(classId)) return {cantrips:[],preparedSpells:[],spellbook:[]};
  const legal = id => SPELLS[id]?.classes.includes(classId);
  const cantripDefaults = classId === 'wizard' ? ['fire_bolt','light','mage_hand'] : ['sacred_flame','guidance','spare_the_dying'];
  const cantrips = choices.cantrips || cantripDefaults;
  if (cantrips.length !== 3 || new Set(cantrips).size !== 3 || cantrips.some(id=>!legal(id)||SPELLS[id].level!==0)) throw new Error('初級呪文の選択が不正');
  if (classId === 'wizard') {
    const spellbook = choices.spellbook || ['magic_missile','shield','burning_hands','detect_magic','mage_armor','thunderwave'];
    if (spellbook.length !== 6 || new Set(spellbook).size !== 6 || spellbook.some(id=>!legal(id)||SPELLS[id].level!==1)) throw new Error('呪文書は合法な6呪文');
    return {cantrips,spellbook,preparedSpells:[]};
  }
  return {cantrips,spellbook:[],preparedSpells:[]};
}
export function createCharacter({name='冒険者',raceId='human',classId='fighter',baseScores,backgroundId='acolyte',choices={}}={}) {
  const race = RACES[raceId], klass = CLASSES[classId], background = BACKGROUNDS[backgroundId];
  if (!race || !klass || !background) throw new Error('未対応の種族・クラス・背景');
  const original = normalizedScores(baseScores,classId);
  const abilities = Object.fromEntries(ABILITIES.map(a=>[a,original[a]+(race.bonus[a]||0)]));
  const {skills,expertise} = chooseSkills(klass,background,choices);
  const spellData = spellChoices(classId,choices);
  const languages = unique([...race.languages,...(choices.languages || [])]);
  if (languages.length < race.languages.length + background.extraLanguages + (raceId==='human'||raceId==='high_elf'?1:0)) {
    const defaults = ['celestial','draconic','dwarvish','elvish','gnomish','goblin','halfling','orc'];
    while (languages.length < race.languages.length + background.extraLanguages + (raceId==='human'||raceId==='high_elf'?1:0)) languages.push(defaults.find(x=>!languages.includes(x)));
  }
  const maxHp = klass.hitDie + abilityModifier(abilities.con) + (raceId==='hill_dwarf'?1:0);
  const armor = classId==='fighter'?'chain':classId==='cleric'?'scale':classId==='rogue'?'leather':'none';
  const shieldEquipped = classId==='cleric';
  const ac = armor==='chain'?16:armor==='scale'?14+Math.min(2,abilityModifier(abilities.dex))+(shieldEquipped?2:0):armor==='leather'?11+abilityModifier(abilities.dex):10+abilityModifier(abilities.dex);
  const character = {id:choices.id || `${raceId}-${classId}-${String(name).trim()}`,name:String(name).trim()||'冒険者',raceId,classId,backgroundId,level:1,
    baseScores:original,raceBonus:{...race.bonus},abilities,proficiencyBonus:2,skills,expertise,savingThrows:[...klass.saves],
    traits:[...race.traits,...klass.traits],languages,size:race.size,speed:race.speed,darkvision:race.darkvision,
    maxHp:Math.max(1,maxHp),hp:Math.max(1,maxHp),tempHp:0,ac,armor,shieldEquipped,
    weapons:[...klass.startingWeapons],cantrips:spellData.cantrips,preparedSpells:spellData.preparedSpells,spellbook:spellData.spellbook,
    slots:{...(klass.slots||{})},maxSlots:{...(klass.slots||{})},spellAbility:klass.spellAbility||null,
    resources:{secondWind:classId==='fighter'?1:0,arcaneRecovery:classId==='wizard'?1:0,hitDice:1},
    effects:[],reactionAvailable:true,actionAvailable:true,bonusActionAvailable:true,deathSuccesses:0,deathFailures:0,stable:false,dead:false,
    turnSpell:null,concentration:null};
  if (classId==='wizard') {
    const count = Math.max(1,1+abilityModifier(abilities.int));
    character.preparedSpells = choices.preparedSpells || character.spellbook.slice(0,count);
    if (character.preparedSpells.length !== count || character.preparedSpells.some(id=>!character.spellbook.includes(id))) throw new Error('準備呪文の選択が不正');
  } else if (classId==='cleric') {
    const count = Math.max(1,1+abilityModifier(abilities.wis));
    const available = Object.keys(SPELLS).filter(id=>SPELLS[id].level===1&&SPELLS[id].classes.includes('cleric'));
    const selected = choices.preparedSpells || available.filter(id=>!['bless','cure_wounds'].includes(id)).slice(0,count);
    if (selected.length !== count || new Set(selected).size !== count || selected.some(id=>!available.includes(id))) throw new Error('準備呪文の選択が不正');
    character.preparedSpells = unique([...selected,'bless','cure_wounds']); // 生命領域呪文は別枠で常に準備。
  }
  if (raceId==='high_elf') {
    character.racialCantrip = choices.racialCantrip || (character.cantrips.includes('fire_bolt')?'prestidigitation':'fire_bolt');
    if (!SPELLS[character.racialCantrip]?.classes.includes('wizard') || SPELLS[character.racialCantrip].level!==0) throw new Error('ハイエルフの呪文が不正');
    character.cantrips = unique([...character.cantrips,character.racialCantrip]);
  }
  if (classId==='fighter') {
    character.fightingStyle=choices.fightingStyle||'defense';
    if(!['defense','archery','dueling'].includes(character.fightingStyle))throw new Error('未対応の戦闘スタイル');
    if(character.fightingStyle==='defense')character.ac++;
  }
  return character;
}

export function abilityCheck(character, ability, dc, rng, options={}) {
  const skill = options.skill;
  if (!ABILITIES.includes(ability) || (skill && SKILL_ABILITIES[skill]!==ability)) throw new Error('能力・技能が不正');
  const stonecunning=skill==='history'&&options.stonework&&has(character,'stonecunning');
  const p = stonecunning ? prof(character)*2 : skill && (character.skills||[]).includes(skill) ? prof(character)*((character.expertise||[]).includes(skill)?2:1) : 0;
  const d = rollD20(rng,{advantage:options.advantage,disadvantage:options.disadvantage,lucky:has(character,'lucky')});
  const bonus = mod(character,ability)+p+(options.bonus||0);
  return {...d,bonus,total:d.roll+bonus,success:d.roll+bonus>=dc,dc};
}
export function savingThrow(character, ability, dc, rng, options={}) {
  if (!ABILITIES.includes(ability)) throw new Error('能力が不正');
  const poison = options.against==='poison' && has(character,'dwarven_resilience');
  const charm = options.against==='charmed' && has(character,'fey_ancestry');
  const fear = options.against==='frightened' && has(character,'brave');
  const d = rollD20(rng,{advantage:options.advantage||poison||charm||fear,disadvantage:options.disadvantage,lucky:has(character,'lucky')});
  const bonus = mod(character,ability)+((character.savingThrows||[]).includes(ability)?prof(character):0)+(options.bonus||0)+(active(character,'bless')?die(4,rng):0);
  return {...d,bonus,total:d.roll+bonus,success:d.roll+bonus>=dc,dc};
}
function spellAbilityFor(caster,spellId) { return spellId && caster.racialCantrip===spellId ? 'int' : caster.spellAbility||'int'; }
export function spellSaveDc(caster,spellId) { return 8+prof(caster)+mod(caster,spellAbilityFor(caster,spellId)); }
export function spellAttackBonus(caster,spellId) { return prof(caster)+mod(caster,spellAbilityFor(caster,spellId)); }
function weaponAbility(actor,weapon) { return weapon.ability==='finesse'?(mod(actor,'dex')>mod(actor,'str')?'dex':'str'):weapon.ability; }
function weaponProficient(actor,id,weapon) { return weapon.group==='unarmed'||(actor.weapons||[]).includes(id)||(CLASSES[actor.classId]?.weaponGroups||[]).includes(weapon.group)||(CLASSES[actor.classId]?.weaponGroups||[]).includes(id); }
export function attackRoll(attacker,target,weaponId='unarmed',rng,options={}) {
  const weapon = WEAPONS[weaponId]; if (!weapon) throw new Error('未対応の武器');
  const ability = weaponAbility(attacker,weapon);
  const d = rollD20(rng,{advantage:options.advantage||options.paralyzed,disadvantage:options.disadvantage||(attacker.size==='small'&&weapon.heavy),lucky:has(attacker,'lucky')});
  const bonus = mod(attacker,ability)+(weaponProficient(attacker,weaponId,weapon)?prof(attacker):0)+(attacker.fightingStyle==='archery'&&weapon.ranged?2:0)+(options.bonus||0)+(active(attacker,'bless')?die(4,rng):0);
  const total = d.roll+bonus;
  const cover = options.cover=== 'half'?2:options.cover==='three_quarters'?5:(options.cover||0);
  const baseAc = active(target,'mage_armor') && (!target.armor || target.armor==='none')
    ? 13+mod(target,'dex') : (target.ac ?? 10);
  const otherAc = active(target,'shield_of_faith')?2:0;
  const initialHit = d.roll!==1 && (d.roll===20 || total>=baseAc+cover+otherAc);
  let updatedTarget = copy(target), shieldUsed=false;
  if (initialHit && options.shieldReaction && !active(target,'shield') && (target.reactionAvailable??true) && (target.slots?.[1]||0)>0 && (target.preparedSpells||[]).includes('shield')) {
    updatedTarget.reactionAvailable=false; updatedTarget.slots={...updatedTarget.slots,1:updatedTarget.slots[1]-1};
    updatedTarget.effects=[...effectList(updatedTarget),{id:'shield',source:'shield',duration:'next_turn'}]; shieldUsed=true;
  }
  const ac = baseAc+cover+otherAc+(shieldUsed?5:active(target,'shield')?5:0);
  const hit = d.roll!==1 && (d.roll===20 || total>=ac); // 自然20は命中。ただしShieldはmagic missileも遮断。
  const critical = hit && (d.roll===20 || (options.paralyzed && options.distanceFeet<=5));
  let damage=0;
  if (hit) {
    if (weaponId==='unarmed') damage=Math.max(0,1+mod(attacker,'str'));
    else damage=Math.max(0,rollDice(weapon.dice[0]*(critical?2:1),weapon.dice[1],rng)+mod(attacker,ability)+(attacker.fightingStyle==='dueling'&&!weapon.ranged?2:0));
    if (has(attacker,'sneak_attack') && (weapon.ability==='finesse'||weapon.ranged) && !options.sneakAttackUsed && (d.advantage || options.allyAdjacent) && !d.disadvantage) damage+=rollDice(critical?2:1,6,rng);
  }
  return {...d,bonus,total,ac,hit,critical,damage,damageType:weapon.type,target:updatedTarget,shieldUsed};
}

export function applyDamage(target,amount,type='bludgeoning',options={}) {
  if (!Number.isFinite(amount)||amount<0) throw new Error('ダメージ量が不正');
  const next=copy(target);
  let damage=Math.floor(amount);
  const immune=(next.immunities||[]).includes(type);
  const resistant=(next.resistances||[]).includes(type)||(type==='poison'&&has(next,'dwarven_resilience'));
  const vulnerable=(next.vulnerabilities||[]).includes(type);
  if (immune) damage=0;
  else { if (resistant) damage=Math.floor(damage/2); if (vulnerable) damage*=2; }
  const tempUsed=Math.min(next.tempHp||0,damage);
  next.tempHp=(next.tempHp||0)-tempUsed;
  const hpDamage=damage-tempUsed;
  const oldHp=next.hp??0;
  if (oldHp===0 && hpDamage>0 && !next.dead) {
    next.stable=false;
    next.deathFailures=(next.deathFailures||0)+(options.critical?2:1);
    if (hpDamage>=(next.maxHp||1)||next.deathFailures>=3) next.dead=true;
  } else if (oldHp>0) {
    next.hp=Math.max(0,oldHp-hpDamage);
    if (hpDamage-oldHp>=(next.maxHp||1)) next.dead=true;
    if (next.hp===0) {next.stable=false;next.deathSuccesses=0;next.deathFailures=0;}
  }
  if(next.hp===0 && next.concentration){
    next.endedConcentration=next.concentration;
    next.effects=effectList(next).filter(e=>e.source!==next.concentration);
    next.concentration=null;
  }
  if (next.concentration && hpDamage>0 && !next.dead && options.concentrationRoll) {
    const dc=Math.max(10,Math.floor(hpDamage/2));
    if (!savingThrow(next,'con',dc,options.concentrationRoll).success) {
      const source=next.concentration; next.concentration=null;next.endedConcentration=source;
      next.effects=effectList(next).filter(e=>e.source!==source);
    }
  } else if(next.concentration && hpDamage>0 && !next.dead) {
    next.pendingConcentrationDc=Math.max(10,Math.floor(hpDamage/2));
  }
  return next;
}
export function heal(target,amount) {
  if (!Number.isFinite(amount)||amount<0) throw new Error('回復量が不正');
  const next=copy(target); if(next.dead) return next;
  next.hp=Math.min(next.maxHp||1,(next.hp||0)+Math.floor(amount));
  if(next.hp>0){next.stable=false;next.deathSuccesses=0;next.deathFailures=0;}
  return next;
}
export function deathSave(target,rng) {
  const next=copy(target);
  if(next.hp>0||next.stable||next.dead) throw new Error('死亡セーヴの対象外');
  const d=rollD20(rng,{lucky:has(next,'lucky')});
  if(d.roll===20){next.hp=1;next.deathSuccesses=0;next.deathFailures=0;}
  else if(d.roll===1) next.deathFailures=(next.deathFailures||0)+2;
  else if(d.roll>=10) next.deathSuccesses=(next.deathSuccesses||0)+1;
  else next.deathFailures=(next.deathFailures||0)+1;
  if(next.deathSuccesses>=3)next.stable=true;
  if(next.deathFailures>=3)next.dead=true;
  return {character:next,...d,stable:next.stable,dead:next.dead};
}
export function resolveConcentration(character,rng) {
  if(!character.concentration || !character.pendingConcentrationDc)throw new Error('集中維持の判定待ちはない');
  const next=copy(character), dc=next.pendingConcentrationDc;
  const check=savingThrow(next,'con',dc,rng);
  next.pendingConcentrationDc=null;
  if(!check.success){
    const source=next.concentration;next.concentration=null;next.endedConcentration=source;
    next.effects=effectList(next).filter(e=>e.source!==source);
  }
  return {character:next,check};
}

function setEffect(target,id,source,duration,extra={}) {
  const next=copy(target);
  next.effects=[...effectList(next),{id,source,duration,...extra}];
  return next;
}
export function removeEffectsBySource(target,source) {
  const next=copy(target);next.effects=effectList(next).filter(e=>e.source!==source);return next;
}
// 種族特性を、画面の説明文とは独立した判定関数にする。
export function applyCondition(target,id,source='unknown',duration=null,{magical=false}={}) {
  if(id==='asleep' && magical && has(target,'fey_ancestry'))return {target:copy(target),applied:false,reason:'魔法では眠らない'};
  return {target:setEffect(target,id,source,duration),applied:true};
}
export function movementSpeed(character,{heavyArmor=false,armorStrengthRequirement=0}={}) {
  const base=character.speed??30;
  if(heavyArmor && score(character,'str')<armorStrengthRequirement && !has(character,'dwarven_armor_speed'))return Math.max(0,base-10);
  return base;
}
export function canMoveThrough(character,other) {
  return has(character,'halfling_nimbleness') && other?.size!=='small' && other?.size!=='tiny';
}
export function canHideBehind(character,other) {
  return has(character,'naturally_stealthy') && ['medium','large','huge','gargantuan'].includes(other?.size);
}
export function perceivedLight(character,ambient,distanceFeet=0) {
  if(!['bright','dim','dark'].includes(ambient))throw new Error('明るさが不正');
  if(distanceFeet<0)throw new Error('距離が不正');
  if(distanceFeet>(character.darkvision||0))return ambient;
  return ambient==='dark'?'dim':ambient==='dim'?'bright':'bright';
}
function assertSpellTurn(caster,spell) {
  const previous=caster.turnSpell;
  if (previous==='bonus' && !(spell.level===0&&spell.time==='action')) throw new Error('ボーナス・アクション呪文後は1アクションの初級呪文のみ');
  if (spell.time==='bonus'&&previous && !(previous==='action_cantrip')) throw new Error('同ターンの他呪文が制限に抵触');
}
export function castSpell(caster,spellId,targets=[],rng,options={}) {
  const spell=SPELLS[spellId];if(!spell)throw new Error('未対応の呪文');
  if (!((caster.cantrips||[]).includes(spellId)||(caster.preparedSpells||[]).includes(spellId)||(spellId===caster.racialCantrip))) throw new Error('未準備の呪文');
  if(spell.level===0 && !(caster.cantrips||[]).includes(spellId))throw new Error('未習得の初級呪文');
  if(spell.time==='reaction' && !options.reactionTrigger)throw new Error('リアクションの発動条件がない');
  assertSpellTurn(caster,spell);
  const slotLevel=options.slotLevel||spell.level;
  if(spell.level>0 && (!options.ritual || !spell.ritual) && ((caster.slots?.[slotLevel]||0)<1 || slotLevel<spell.level))throw new Error('呪文スロットが不足');
  if(spell.time==='action' && caster.actionAvailable===false)throw new Error('アクションが残っていない');
  if(spell.time==='bonus' && caster.bonusActionAvailable===false)throw new Error('ボーナス・アクションが残っていない');
  if(spell.time==='reaction' && caster.reactionAvailable===false)throw new Error('リアクションが残っていない');
  if(!Array.isArray(targets))throw new Error('対象の形式が不正');
  const next=copy(caster), out=targets.map(copy), details=[];
  if(spell.concentration && next.concentration){
    const old=next.concentration;next.endedConcentration=old;
    next.effects=effectList(next).filter(e=>e.source!==old);
    for(let i=0;i<out.length;i++)out[i]=removeEffectsBySource(out[i],old);
  }
  // 裁定が必要な自由効果は、実行前に利用者が選んだ内容を要求する。
  if(['utility','command'].includes(spell.effect) && !options.declaration)throw new Error('効果の具体的な宣言が必要');
  if(spell.effect==='command' && !['approach','drop','flee','grovel','halt'].includes(options.declaration))throw new Error('対応する命令語を選択');
  if(spell.effect==='attack'){
    if(out.length!==1)throw new Error('対象を1体指定');
    const d=rollD20(rng,{lucky:has(next,'lucky')});
    const total=d.roll+spellAttackBonus(next,spellId)+(active(next,'bless')?die(4,rng):0),hit=d.roll!==1&&(d.roll===20||total>=out[0].ac);
    const damage=hit?rollDice(spell.dice[0]*(d.roll===20?2:1),spell.dice[1],rng):0;
    if(hit){out[0]=applyDamage(out[0],damage,spell.type);if(spellId==='guiding_bolt')out[0]=setEffect(out[0],'guiding_bolt_advantage',spellId,'next_attack',{casterId:next.id});}
    details.push({target:0,roll:d.roll,total,hit,damage});
  } else if(spell.effect==='save_damage'||spell.effect==='area_save_half'){
    if(!out.length)throw new Error('対象を指定');
    const damage=rollDice(spell.dice[0]+(slotLevel-spell.level),spell.dice[1],rng);
    for(let i=0;i<out.length;i++){
      const save=savingThrow(out[i],spell.save,spellSaveDc(next,spellId),rng,{bonus:0});
      const dealt=save.success?(spell.effect==='area_save_half'?Math.floor(damage/2):0):damage;
      out[i]=applyDamage(out[i],dealt,spell.type);details.push({target:i,save,damage:dealt,pushFeet:spell.push&&!save.success?spell.push:0});
    }
  } else if(spell.effect==='missiles'){
    if(!out.length)throw new Error('対象を指定');
    const missiles=3+slotLevel-1, allocations=options.allocations||Array(missiles).fill(0);
    if(allocations.length!==missiles||allocations.some(i=>!Number.isInteger(i)||i<0||i>=out.length))throw new Error('魔法の矢の割当が不正');
    const damage=die(4,rng)+1;
    for(const i of allocations){if(!active(out[i],'shield'))out[i]=applyDamage(out[i],damage,'force');details.push({target:i,damage:active(out[i],'shield')?0:damage});}
  } else if(spell.effect==='heal'){
    if(out.length!==1)throw new Error('回復対象を1体指定');
    let amount=rollDice(spell.dice[0]+slotLevel-1,spell.dice[1],rng)+mod(next,next.spellAbility||'wis');
    if(has(next,'disciple_of_life'))amount+=2+slotLevel;
    out[0]=heal(out[0],Math.max(0,amount));details.push({target:0,healing:Math.max(0,amount)});
  } else if(spell.effect==='stabilize'){
    if(out.length!==1||out[0].hp!==0||['undead','construct'].includes(out[0].creatureType))throw new Error('対象を安定化できない');out[0].stable=true;details.push({target:0,stable:true});
  } else if(spell.effect==='shield'){
    next.effects=[...effectList(next),{id:'shield',source:spellId,duration:'next_turn'}];details.push({acBonus:5});
  } else if(['guidance','resistance','bless','shield_of_faith','sanctuary','mage_armor','light'].includes(spell.effect)){
    if(!out.length)throw new Error('対象を指定');
    const cap=spellId==='bless'?Math.min(3+slotLevel-1,out.length):1;
    if(spellId!=='bless' && out.length!==1)throw new Error('対象を1体指定');
    for(let i=0;i<cap;i++){
      if(spell.effect==='mage_armor' && out[i].armor && out[i].armor!=='none')throw new Error('鎧を着た対象にはメイジ・アーマーを使えない');
      out[i]=setEffect(out[i],spell.effect,spellId,spell.duration,{casterId:next.id});details.push({target:i,effect:spell.effect});
    }
  } else if(spell.effect==='detect_magic'){
    next.effects=[...effectList(next),{id:'detect_magic',source:spellId,duration:spell.duration}];details.push({detected:options.detected||[]});
  } else if(spell.effect==='utility'){
    details.push({declaration:String(options.declaration)});
  } else if(spell.effect==='command'){
    if(out.length!==1)throw new Error('対象を1体指定');
    const save=savingThrow(out[0],'wis',spellSaveDc(next,spellId),rng);
    if(!save.success)out[0]=setEffect(out[0],`command_${options.declaration}`,spellId,'next_turn',{casterId:next.id});
    details.push({target:0,save,command:options.declaration});
  } else throw new Error('未実装の効果');
  if(spell.level>0 && !(options.ritual&&spell.ritual))next.slots={...next.slots,[slotLevel]:next.slots[slotLevel]-1};
  if(spell.time==='action')next.actionAvailable=false;
  if(spell.time==='bonus')next.bonusActionAvailable=false;
  if(spell.time==='reaction')next.reactionAvailable=false;
  next.turnSpell=spell.time==='bonus'?'bonus':spell.level===0&&spell.time==='action'?'action_cantrip':'other';
  if(spell.concentration)next.concentration=spellId;
  // 自分を対象にしたとき、術者の資源消費と対象への効果を同じ状態へ統合する。
  for(let i=0;i<targets.length;i++)if(targets[i]?.id && targets[i].id===caster.id){
    next.hp=out[i].hp;next.tempHp=out[i].tempHp;next.stable=out[i].stable;
    next.effects=[...effectList(next),...effectList(out[i]).filter(e=>!effectList(next).some(n=>JSON.stringify(n)===JSON.stringify(e)))];
    out[i]=copy(next);
  }
  return {caster:next,targets:out,spellId,spentSlot:spell.level>0&&!(options.ritual&&spell.ritual)?slotLevel:0,description:`${next.name||'術者'}は${spell.name}を発動した。`,details};
}

export function shortRest(character,rng,options={}) {
  if(character.dead || character.hp<1)throw new Error('HP0の者は小休憩の利益を得られない');
  const next=copy(character), dice=Math.min(options.hitDice??0,next.resources?.hitDice||0);
  if(!Number.isInteger(dice)||dice<0)throw new Error('ヒットダイス数が不正');
  const hitDie=CLASSES[next.classId]?.hitDie||8;
  let healing=0;for(let i=0;i<dice;i++)healing+=Math.max(0,die(hitDie,rng)+mod(next,'con'));
  next.hp=Math.min(next.maxHp,next.hp+healing);
  next.resources={...next.resources,hitDice:(next.resources?.hitDice||0)-dice};
  if(has(next,'second_wind'))next.resources.secondWind=1;
  if(has(next,'arcane_recovery')&&next.resources.arcaneRecovery && options.arcaneRecovery){
    next.slots={...next.slots,1:Math.min(next.maxSlots[1],(next.slots[1]||0)+1)};next.resources.arcaneRecovery=0;
  }
  return next;
}
export function longRest(character) {
  const next=copy(character);if(next.dead || next.hp<1)return next;
  next.hp=next.maxHp;next.slots={...next.maxSlots};next.tempHp=0;
  next.deathSuccesses=0;next.deathFailures=0;next.stable=false;
  next.resources={...next.resources,secondWind:has(next,'second_wind')?1:0,arcaneRecovery:has(next,'arcane_recovery')?1:0,hitDice:1};
  next.effects=[];next.concentration=null;next.reactionAvailable=true;next.actionAvailable=true;next.bonusActionAvailable=true;next.turnSpell=null;
  return next;
}
export function startTurn(character) {
  const next=copy(character);next.reactionAvailable=true;next.actionAvailable=true;next.bonusActionAvailable=true;next.turnSpell=null;
  next.effects=effectList(next).filter(e=>e.duration!=='next_turn');return next;
}
export function secondWind(character,rng) {
  if(!has(character,'second_wind')||!(character.resources?.secondWind)||character.bonusActionAvailable===false)throw new Error('セカンド・ウィンドを使用できない');
  const next=heal(character,die(10,rng)+(character.level||1));next.resources={...next.resources,secondWind:0};next.bonusActionAvailable=false;return next;
}
