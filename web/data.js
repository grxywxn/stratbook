// Arsenal and theme data. This is starting data written from memory of the
// game's loadouts; Ubisoft changes loadouts often, so every part of it can be
// edited inside the app (Arsenal tab and each operator's Loadout section).
window.ARSENAL = {
  // name -> type
  weapons: {
    // Assault rifles
    'AK-12': 'ar', 'AK-74M': 'ar', '552 Commando': 'ar', '556xi': 'ar', 'AR33': 'ar', 'ARX200': 'ar',
    'AUG A2': 'ar', 'C7E': 'ar', 'C8-SFW': 'ar', 'F2': 'ar', 'F90': 'ar', 'G36C': 'ar', 'L85A2': 'ar',
    'M4': 'ar', 'M762': 'ar', 'Mk17 CQB': 'ar', 'PARA-308': 'ar', 'R4-C': 'ar', 'Spear .308': 'ar',
    'Type-89': 'ar', 'V308': 'ar', '416-C Carbine': 'ar', 'POF-9': 'ar', 'Commando 9': 'ar', 'SC3000K': 'ar',
    // SMGs
    '9mm C1': 'smg', '9x19VSN': 'smg', 'AUG A3': 'smg', 'FMG-9': 'smg', 'K1A': 'smg', 'M12': 'smg',
    'MP5': 'smg', 'MP5K': 'smg', 'MP5SD': 'smg', 'MP7': 'smg', 'MPX': 'smg', 'Mx4 Storm': 'smg',
    'P10 RONI': 'smg', 'P90': 'smg', 'PDW9': 'smg', 'Scorpion EVO 3 A1': 'smg', 'T-5 SMG': 'smg',
    'UMP45': 'smg', 'UZK50GI': 'smg', 'Vector .45 ACP': 'smg',
    // LMGs
    '6P41': 'lmg', 'ALDA 5.56': 'lmg', 'DP27': 'lmg', 'G8A1': 'lmg', 'LMG-E': 'lmg', 'M249': 'lmg',
    'M249 SAW': 'lmg', 'T-95 LSW': 'lmg',
    // Marksman
    '417': 'dmr', 'AR-15.50': 'dmr', 'CAMRS': 'dmr', 'Mk 14 EBR': 'dmr', 'OTs-03': 'dmr', 'SR-25': 'dmr',
    'CSRX 300': 'dmr',
    // Shotguns
    'ACS12': 'shotgun', 'BOSG.12.2': 'shotgun', 'FO-12': 'shotgun', 'ITA12L': 'shotgun', 'M1014': 'shotgun',
    'M590A1': 'shotgun', 'M870': 'shotgun', 'SASG-12': 'shotgun', 'SG-CQB': 'shotgun', 'SIX12': 'shotgun',
    'SIX12 SD': 'shotgun', 'SPAS-12': 'shotgun', 'SPAS-15': 'shotgun', 'Super 90': 'shotgun',
    'SuperNova': 'shotgun', 'TCSG12': 'shotgun',
    // Shields (primary slot)
    'Ballistic shield': 'shield', 'Extendable shield': 'shield', 'Flash shield': 'shield', 'CCE shield': 'shield',
    // Machine pistols
    'SMG-11': 'mp', 'SMG-12': 'mp', 'SPSMG9': 'mp', 'Bearing 9': 'mp', 'C75 Auto': 'mp',
    // Pistols
    '1911 TACOPS': 'pistol', '5.7 USG': 'pistol', 'GSh-18': 'pistol', 'Luison': 'pistol', 'M45 MEUSOC': 'pistol',
    'MK1 9mm': 'pistol', 'P-10C': 'pistol', 'P12': 'pistol', 'P226 Mk 25': 'pistol', 'P229': 'pistol',
    'P9': 'pistol', 'PMM': 'pistol', 'PRB92': 'pistol', 'Q-929': 'pistol', 'RG15': 'pistol', 'SDP 9mm': 'pistol',
    'USP40': 'pistol', 'TACIT .45': 'pistol',
    // Revolvers and hand cannons
    'D-50': 'revolver', 'Keratos .357': 'revolver', 'LFP586': 'revolver', '.44 Mag Semi-Auto': 'revolver',
    '.44 Vendetta': 'revolver',
    // Secondary shotguns and launchers
    'Bailiff 410': 'shotgun', 'ITA12S': 'shotgun', 'Super Shorty': 'shotgun', 'GONNE-6': 'launcher'
  },

  gadgets: [
    'Frag grenade', 'Smoke grenade', 'Stun grenade', 'Breach charge', 'Hard breach charge', 'Claymore',
    'Impact EMP grenade', 'Barbed wire', 'Deployable shield', 'Bulletproof camera', 'Impact grenade',
    'Nitro cell', 'Proximity alarm', 'Observation blocker'
  ],

  // operator -> [primaries, secondaries, gadgets], each "a|b|c"
  loadouts: {
    'Ace': ['AK-12|M1014', 'P9|LFP586', 'Breach charge|Claymore'],
    'Amaru': ['G8A1|SuperNova', 'SMG-11|ITA12S', 'Hard breach charge|Stun grenade'],
    'Ash': ['R4-C|G36C', 'M45 MEUSOC|5.7 USG', 'Breach charge|Claymore'],
    'Blackbeard': ['Mk17 CQB|SR-25', 'D-50', 'Claymore|Stun grenade'],
    'Blitz': ['Flash shield', 'P12', 'Smoke grenade|Breach charge'],
    'Brava': ['PARA-308|CAMRS', 'Super Shorty|USP40', 'Smoke grenade|Claymore'],
    'Buck': ['C8-SFW|CAMRS', 'MK1 9mm|GONNE-6', 'Stun grenade|Hard breach charge'],
    'Capitão': ['PARA-308|M249', 'PRB92|GONNE-6', 'Claymore|Hard breach charge'],
    'Deimos': ['AK-74M|M590A1', '.44 Vendetta', 'Frag grenade|Hard breach charge'],
    'Dokkaebi': ['Mk 14 EBR|BOSG.12.2', 'SMG-12|C75 Auto|GONNE-6', 'Smoke grenade|Breach charge'],
    'Finka': ['Spear .308|6P41|SASG-12', 'PMM|GSh-18', 'Stun grenade|Hard breach charge'],
    'Flores': ['AR33|SR-25', 'GSh-18', 'Stun grenade|Claymore'],
    'Fuze': ['AK-12|6P41|Ballistic shield', 'PMM|GSh-18', 'Breach charge|Hard breach charge'],
    'Glaz': ['OTs-03', 'PMM|Bearing 9|GSh-18', 'Smoke grenade|Frag grenade|Claymore'],
    'Gridlock': ['F90|M249 SAW', 'Super Shorty|SDP 9mm|GONNE-6', 'Smoke grenade|Breach charge'],
    'Grim': ['552 Commando|SG-CQB', 'P229', 'Claymore|Breach charge'],
    'Hibana': ['Type-89|SuperNova', 'Bearing 9|P229', 'Stun grenade|Breach charge'],
    'Iana': ['ARX200|G36C', 'MK1 9mm|GONNE-6', 'Smoke grenade|Frag grenade'],
    'IQ': ['AUG A2|552 Commando|G8A1', 'P12', 'Breach charge|Claymore'],
    'Jackal': ['C7E|PDW9|ITA12L', 'ITA12S|USP40', 'Claymore|Smoke grenade'],
    'Kali': ['CSRX 300', 'C75 Auto|SPSMG9|P226 Mk 25', 'Breach charge|Claymore'],
    'Lion': ['V308|417|SG-CQB', 'LFP586|P9', 'Stun grenade|Claymore'],
    'Maverick': ['AR-15.50|M4', '1911 TACOPS', 'Frag grenade|Claymore'],
    'Montagne': ['Extendable shield', 'P9|LFP586', 'Hard breach charge|Smoke grenade'],
    'Nøkk': ['FMG-9|SIX12 SD', '5.7 USG|D-50', 'Frag grenade|Hard breach charge'],
    'Nomad': ['AK-74M|ARX200', '.44 Mag Semi-Auto|PRB92', 'Breach charge|Stun grenade'],
    'Osa': ['556xi|PDW9', 'PMM', 'Claymore|Smoke grenade'],
    'Ram': ['R4-C|LMG-E', 'MK1 9mm|ITA12S', 'Stun grenade|Smoke grenade'],
    'Sens': ['POF-9|417', 'SDP 9mm|GONNE-6', 'Hard breach charge|Claymore'],
    'Sledge': ['L85A2|M590A1', 'P226 Mk 25|SMG-11', 'Frag grenade|Stun grenade'],
    'Solid Snake': ['', 'TACIT .45', ''],
    'Thatcher': ['AR33|L85A2|M590A1', 'P226 Mk 25', 'Breach charge|Claymore'],
    'Thermite': ['556xi|M1014', '5.7 USG|M45 MEUSOC', 'Smoke grenade|Stun grenade'],
    'Twitch': ['F2|417|SG-CQB', 'P9|LFP586', 'Smoke grenade|Claymore'],
    'Ying': ['T-95 LSW|SIX12', 'Q-929', 'Hard breach charge|Smoke grenade'],
    'Zero': ['SC3000K|MP7', '5.7 USG|GONNE-6', 'Claymore|Hard breach charge'],
    'Zofia': ['LMG-E|M762', 'RG15', 'Breach charge|Claymore'],

    'Alibi': ['Mx4 Storm|ACS12', 'Keratos .357|Bailiff 410', 'Impact grenade|Deployable shield'],
    'Aruni': ['P10 RONI|Mk 14 EBR', 'PRB92', 'Barbed wire|Bulletproof camera'],
    'Azami': ['9x19VSN|ACS12', 'D-50', 'Impact grenade|Barbed wire'],
    'Bandit': ['MP7|M870', 'P12', 'Barbed wire|Nitro cell'],
    'Castle': ['UMP45|M1014', '5.7 USG|Super Shorty', 'Proximity alarm|Bulletproof camera'],
    'Caveira': ['M12|SPAS-15', 'Luison', 'Impact grenade|Proximity alarm'],
    'Clash': ['CCE shield', 'Super Shorty|SPSMG9', 'Barbed wire|Impact grenade'],
    'Doc': ['MP5|P90|SG-CQB', 'P9|LFP586|Bailiff 410', 'Barbed wire|Bulletproof camera'],
    'Echo': ['MP5SD|SuperNova', 'P229|Bearing 9', 'Impact grenade|Deployable shield'],
    'Ela': ['Scorpion EVO 3 A1|FO-12', 'RG15', 'Barbed wire|Impact grenade'],
    'Fenrir': ['MP7|SASG-12', 'Bailiff 410|5.7 USG', 'Bulletproof camera|Observation blocker'],
    'Frost': ['9mm C1|Super 90', 'MK1 9mm|ITA12S', 'Bulletproof camera|Deployable shield'],
    'Goyo': ['Vector .45 ACP|TCSG12', 'P229', 'Proximity alarm|Bulletproof camera'],
    'Jäger': ['416-C Carbine|M870', 'P12', 'Bulletproof camera|Observation blocker'],
    'Kaid': ['AUG A3|TCSG12', '.44 Mag Semi-Auto|LFP586', 'Barbed wire|Nitro cell'],
    'Kapkan': ['9x19VSN|SASG-12', 'PMM|GSh-18', 'Impact grenade|Nitro cell'],
    'Lesion': ['SIX12 SD|T-5 SMG', 'Q-929', 'Bulletproof camera|Observation blocker'],
    'Maestro': ['ALDA 5.56|ACS12', 'Bailiff 410|Keratos .357', 'Barbed wire|Impact grenade'],
    'Melusi': ['MP5|Super 90', 'RG15', 'Impact grenade|Bulletproof camera'],
    'Mira': ['Vector .45 ACP|ITA12L', 'USP40|ITA12S', 'Proximity alarm|Nitro cell'],
    'Mozzie': ['Commando 9|P10 RONI', 'SDP 9mm', 'Barbed wire|Nitro cell'],
    'Mute': ['MP5K|M590A1', 'SMG-11|P226 Mk 25', 'Bulletproof camera|Nitro cell'],
    'Oryx': ['T-5 SMG|SPAS-12', 'Bailiff 410|USP40', 'Barbed wire|Proximity alarm'],
    'Pulse': ['UMP45|M1014', '5.7 USG', 'Barbed wire|Nitro cell'],
    'Rook': ['P90|MP5|SG-CQB', 'P9|LFP586', 'Proximity alarm|Impact grenade'],
    'Sentry': ['Commando 9|M870', 'C75 Auto|Super Shorty', 'Barbed wire|Impact grenade'],
    'Smoke': ['FMG-9|M590A1', 'SMG-11|P226 Mk 25', 'Barbed wire|Proximity alarm'],
    'Solis': ['P90|ITA12L', 'SMG-11', 'Impact grenade|Bulletproof camera'],
    'Tachanka': ['DP27|9x19VSN', 'PMM|GSh-18|Bearing 9', 'Barbed wire|Proximity alarm'],
    'Thorn': ['UZK50GI|M870', '1911 TACOPS|C75 Auto', 'Barbed wire|Deployable shield'],
    'Thunderbird': ['Spear .308|SPAS-15', 'Bearing 9|Q-929', 'Barbed wire|Bulletproof camera'],
    'Tubarão': ['MPX|AR-15.50', 'P226 Mk 25', 'Proximity alarm|Nitro cell'],
    'Valkyrie': ['MPX|SPAS-12', 'D-50', 'Impact grenade|Nitro cell'],
    'Vigil': ['K1A|BOSG.12.2', 'C75 Auto|SMG-12', 'Impact grenade|Bulletproof camera'],
    'Wamai': ['AUG A2|MP5K', 'Keratos .357|P12', 'Impact grenade|Proximity alarm'],
    'Warden': ['M590A1|MPX', 'P-10C|SMG-12', 'Deployable shield|Nitro cell']
  },

  types: {
    ar: { label: 'Assault rifle', color: '#e3a33b' },
    smg: { label: 'SMG', color: '#4fb8a5' },
    lmg: { label: 'LMG', color: '#d9594a' },
    dmr: { label: 'Marksman', color: '#9a86e0' },
    shotgun: { label: 'Shotgun', color: '#e88a5c' },
    shield: { label: 'Shield', color: '#8a9bb0' },
    mp: { label: 'Machine pistol', color: '#5fa5e0' },
    pistol: { label: 'Pistol', color: '#a9c46a' },
    revolver: { label: 'Revolver / hand cannon', color: '#d4b04a' },
    launcher: { label: 'Launcher', color: '#d46a9b' }
  },

  typeOrder: ['ar', 'smg', 'lmg', 'dmr', 'shotgun', 'shield', 'mp', 'pistol', 'revolver', 'launcher']
};

// A colour for each map, used for its banner art, backgrounds and accents.
window.MAP_COLORS = {
  'Bank': '#d1a73a', 'Border': '#cf7b3e', 'Calypso Casino': '#d0457e', 'Chalet': '#6fb0e6',
  'Clubhouse': '#c2553a', 'Coastline': '#2fbcb4', 'Consulate': '#8fa6bf', 'Emerald Plains': '#46b06a',
  'Favela': '#e58e34', 'Fortress': '#c47042', 'Hereford Base': '#89a067', 'House': '#b07a55',
  'Kafe Dostoyevsky': '#b54a5b', 'Kanal': '#4a90c4', 'Lair': '#a83a48', 'Nighthaven Labs': '#6f7de0',
  'Oregon': '#c9944a', 'Outback': '#d8653f', 'Presidential Plane': '#9cb4c6', 'Skyscraper': '#e07aa0',
  'Stadium Bravo': '#8cc24a', 'Theme Park': '#e56ab0', 'Tower': '#6b8fd6', 'Villa': '#b89a58', 'Yacht': '#4fa8bf'
};
