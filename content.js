// 初版採用項目。出典はSRD 5.1（2014年版）pp.3-8, 14-17, 22-24, 37-40, 51-54, 125-191。
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const RACES = {
  hill_dwarf: {name:'ヒル・ドワーフ', bonus:{con:2,wis:1}, size:'medium', speed:25, darkvision:60, languages:['common','dwarvish'], traits:['dwarven_resilience','dwarven_toughness','dwarven_armor_speed','stonecunning','dwarven_combat_training','dwarven_tool_proficiency']},
  high_elf: {name:'ハイエルフ', bonus:{dex:2,int:1}, size:'medium', speed:30, darkvision:60, languages:['common','elvish'], traits:['keen_senses','fey_ancestry','trance','elf_weapon_training','high_elf_cantrip']},
  lightfoot_halfling: {name:'ライトフット・ハーフリング', bonus:{dex:2,cha:1}, size:'small', speed:25, darkvision:0, languages:['common','halfling'], traits:['lucky','brave','halfling_nimbleness','naturally_stealthy']},
  human: {name:'標準人間', bonus:{str:1,dex:1,con:1,int:1,wis:1,cha:1}, size:'medium', speed:30, darkvision:0, languages:['common'], traits:['extra_language']},
};
export const CLASSES = {
  fighter: {name:'ファイター', hitDie:10, saves:['str','con'], skillCount:2, skillChoices:['acrobatics','animal_handling','athletics','history','insight','intimidation','perception','survival'], armor:['light','medium','heavy','shield'], weaponGroups:['simple','martial'], traits:['fighting_style','second_wind'], startingWeapons:['longsword','light_crossbow']},
  rogue: {name:'ローグ', hitDie:8, saves:['dex','int'], skillCount:4, skillChoices:['acrobatics','athletics','deception','insight','intimidation','investigation','perception','performance','persuasion','sleight_of_hand','stealth'], armor:['light'], weaponGroups:['simple','rapier','shortsword','longsword','hand_crossbow'], traits:['expertise','sneak_attack','thieves_cant'], startingWeapons:['rapier','dagger','shortbow']},
  cleric: {name:'クレリック', hitDie:8, saves:['wis','cha'], skillCount:2, skillChoices:['history','insight','medicine','persuasion','religion'], armor:['light','medium','heavy','shield'], weaponGroups:['simple'], traits:['spellcasting','life_domain','disciple_of_life'], spellAbility:'wis', cantripCount:3, slots:{1:2}, startingWeapons:['mace']},
  wizard: {name:'ウィザード', hitDie:6, saves:['int','wis'], skillCount:2, skillChoices:['arcana','history','insight','investigation','medicine','religion'], armor:[], weaponGroups:['dagger','dart','sling','quarterstaff','light_crossbow'], traits:['spellcasting','arcane_recovery'], spellAbility:'int', cantripCount:3, slots:{1:2}, startingWeapons:['quarterstaff','dagger']},
};
// 背景の表示文は初版用の独自表現。
export const BACKGROUNDS = {
  acolyte:{name:'侍者',skills:['insight','religion'],extraLanguages:2},
  soldier:{name:'兵士',skills:['athletics','intimidation'],extraLanguages:0},
  criminal:{name:'裏稼業',skills:['deception','stealth'],extraLanguages:0},
  sage:{name:'研究者',skills:['arcana','history'],extraLanguages:2},
};
export const SKILL_ABILITIES = {acrobatics:'dex',animal_handling:'wis',arcana:'int',athletics:'str',deception:'cha',history:'int',insight:'wis',intimidation:'cha',investigation:'int',medicine:'wis',nature:'int',perception:'wis',performance:'cha',persuasion:'cha',religion:'int',sleight_of_hand:'dex',stealth:'dex',survival:'wis'};
// ダイスは [個数, 面数]。素手は固定1+筋力修正値。
export const WEAPONS = {
  unarmed:{name:'素手',dice:[0,0],type:'bludgeoning',ability:'str',group:'unarmed'},
  dagger:{name:'ダガー',dice:[1,4],type:'piercing',ability:'finesse',group:'simple'},
  quarterstaff:{name:'クオータースタッフ',dice:[1,6],type:'bludgeoning',ability:'str',group:'simple'},
  mace:{name:'メイス',dice:[1,6],type:'bludgeoning',ability:'str',group:'simple'},
  shortsword:{name:'ショートソード',dice:[1,6],type:'piercing',ability:'finesse',group:'martial'},
  rapier:{name:'レイピア',dice:[1,8],type:'piercing',ability:'finesse',group:'martial'},
  longsword:{name:'ロングソード',dice:[1,8],type:'slashing',ability:'str',group:'martial'},
  shortbow:{name:'ショートボウ',dice:[1,6],type:'piercing',ability:'dex',group:'simple',ranged:true},
  longbow:{name:'ロングボウ',dice:[1,8],type:'piercing',ability:'dex',group:'martial',ranged:true,heavy:true},
  light_crossbow:{name:'ライト・クロスボウ',dice:[1,8],type:'piercing',ability:'dex',group:'simple',ranged:true},
  handaxe:{name:'ハンドアックス',dice:[1,6],type:'slashing',ability:'str',group:'simple'},
  battleaxe:{name:'バトルアックス',dice:[1,8],type:'slashing',ability:'str',group:'martial'},
  light_hammer:{name:'ライト・ハンマー',dice:[1,4],type:'bludgeoning',ability:'str',group:'simple'},
  warhammer:{name:'ウォーハンマー',dice:[1,8],type:'bludgeoning',ability:'str',group:'martial'},
};
// 21呪文の効果IDはrules.jsの分岐と対応する。数値化不能な行動には裁定入力を要求する。
export const SPELLS = {
  fire_bolt:{name:'ファイア・ボルト',level:0,classes:['wizard'],time:'action',range:120,effect:'attack',dice:[1,10],type:'fire'},
  light:{name:'ライト',level:0,classes:['cleric','wizard'],time:'action',range:0,effect:'light',duration:3600},
  mage_hand:{name:'メイジ・ハンド',level:0,classes:['wizard'],time:'action',range:30,effect:'utility',duration:60},
  prestidigitation:{name:'プレスティディジテイション',level:0,classes:['wizard'],time:'action',range:10,effect:'utility',duration:3600},
  sacred_flame:{name:'セイクリッド・フレイム',level:0,classes:['cleric'],time:'action',range:60,effect:'save_damage',save:'dex',dice:[1,8],type:'radiant',ignoresCover:true},
  guidance:{name:'ガイダンス',level:0,classes:['cleric'],time:'action',range:0,effect:'guidance',concentration:true,duration:60},
  spare_the_dying:{name:'スペア・ザ・ダイイング',level:0,classes:['cleric'],time:'action',range:0,effect:'stabilize'},
  resistance:{name:'レジスタンス',level:0,classes:['cleric'],time:'action',range:0,effect:'resistance',concentration:true,duration:60},
  magic_missile:{name:'マジック・ミサイル',level:1,classes:['wizard'],time:'action',range:120,effect:'missiles',type:'force'},
  shield:{name:'シールド',level:1,classes:['wizard'],time:'reaction',range:0,effect:'shield',duration:'next_turn'},
  burning_hands:{name:'バーニング・ハンズ',level:1,classes:['wizard'],time:'action',range:15,effect:'area_save_half',save:'dex',dice:[3,6],type:'fire'},
  detect_magic:{name:'ディテクト・マジック',level:1,classes:['cleric','wizard'],time:'action',range:30,effect:'detect_magic',concentration:true,duration:600,ritual:true},
  mage_armor:{name:'メイジ・アーマー',level:1,classes:['wizard'],time:'action',range:0,effect:'mage_armor',duration:28800},
  thunderwave:{name:'サンダーウェイヴ',level:1,classes:['wizard'],time:'action',range:15,effect:'area_save_half',save:'con',dice:[2,8],type:'thunder',push:10},
  cure_wounds:{name:'キュア・ウーンズ',level:1,classes:['cleric'],time:'action',range:0,effect:'heal',dice:[1,8]},
  healing_word:{name:'ヒーリング・ワード',level:1,classes:['cleric'],time:'bonus',range:60,effect:'heal',dice:[1,4]},
  bless:{name:'ブレス',level:1,classes:['cleric'],time:'action',range:30,effect:'bless',concentration:true,duration:60},
  guiding_bolt:{name:'ガイディング・ボルト',level:1,classes:['cleric'],time:'action',range:120,effect:'attack',dice:[4,6],type:'radiant'},
  sanctuary:{name:'サンクチュアリ',level:1,classes:['cleric'],time:'bonus',range:30,effect:'sanctuary',duration:60},
  shield_of_faith:{name:'シールド・オヴ・フェイス',level:1,classes:['cleric'],time:'bonus',range:60,effect:'shield_of_faith',concentration:true,duration:600},
  command:{name:'コマンド',level:1,classes:['cleric'],time:'action',range:60,effect:'command',save:'wis'},
};
