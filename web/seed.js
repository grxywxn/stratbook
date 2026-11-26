// Starting data. Everything here can be edited inside the app; sites marked
// in a map's list can be renamed, added or removed when Ubisoft reworks a map.
window.SEED = {
  maps: [
    ["Bank", ["2F Executive Lounge / CEO Office", "1F Staff Room / Open Area", "1F Tellers' Office / Archives", "B Lockers / CCTV Room"]],
    ["Border", ["2F Armory Lockers / Archives", "1F Ventilation Room / Workshop", "1F Customs Inspection / Supply Room", "1F Bathroom / Tellers"]],
    ["Calypso Casino", []],
    ["Chalet", ["2F Master Bedroom / Office", "1F Bar / Gaming Room", "1F Dining Room / Kitchen", "B Wine Cellar / Snowmobile Garage"]],
    ["Clubhouse", ["2F Gym / Bedroom", "2F CCTV / Cash", "1F Bar / Stock", "B Church / Arsenal"]],
    ["Coastline", ["2F Hookah Lounge / Billiards Room", "2F Penthouse / Theater", "1F Kitchen / Service Entrance", "1F Sunrise Bar / Blue Bar"]],
    ["Consulate", ["2F Consul Office / Meeting Room", "1F Lobby / Press Room", "B Archives / Tellers", "B Garage / Cafeteria"]],
    ["Emerald Plains", []],
    ["Favela", []],
    ["Fortress", []],
    ["Hereford Base", []],
    ["House", []],
    ["Kafe Dostoyevsky", ["3F Bar / Cocktail Lounge", "2F Mining Room / Training Room", "2F Fireplace Hall / Reading Room", "1F Kitchen Cooking / Kitchen Service"]],
    ["Kanal", []],
    ["Lair", []],
    ["Nighthaven Labs", ["2F Command Center / Servers", "1F Kitchen / Cafeteria"]],
    ["Oregon", ["2F Kids' Dorms / Dorms Main Hall", "1F Kitchen / Dining Hall", "1F Meeting Hall / Kitchen", "B Laundry Room / Supply Room"]],
    ["Outback", []],
    ["Presidential Plane", []],
    ["Skyscraper", ["2F Tea Room / Karaoke", "2F Exhibition / Office", "1F Kitchen / BBQ", "1F Bedroom / Bathroom"]],
    ["Stadium Bravo", []],
    ["Theme Park", ["2F Initiation Room / Office", "2F Bunk / Day Care", "1F Armory / Throne Room", "1F Lab / Storage"]],
    ["Tower", []],
    ["Villa", ["2F Aviator Room / Games Room", "2F Trophy Room / Statuary Room", "1F Living Room / Library", "1F Dining Room / Kitchen"]],
    ["Yacht", []]
  ],
  attackers: [
    "Ace", "Amaru", "Ash", "Blackbeard", "Blitz", "Brava", "Buck", "Capitão", "Deimos", "Dokkaebi",
    "Finka", "Flores", "Fuze", "Glaz", "Gridlock", "Grim", "Hibana", "Iana", "IQ", "Jackal", "Kali",
    "Lion", "Maverick", "Montagne", "Nøkk", "Nomad", "Osa", "Ram", "Rauora", "Sens", "Sledge",
    "Solid Snake", "Striker", "Thatcher", "Thermite", "Twitch", "Ying", "Zero", "Zofia"
  ],
  defenders: [
    "Alibi", "Aruni", "Azami", "Bandit", "Castle", "Caveira", "Clash", "Denari", "Doc", "Echo", "Ela",
    "Fenrir", "Frost", "Goyo", "Jäger", "Kaid", "Kapkan", "Lesion", "Maestro", "Melusi", "Mira",
    "Mozzie", "Mute", "Noor", "Oryx", "Pulse", "Rook", "Sentry", "Skopós", "Smoke", "Solis",
    "Tachanka", "Thorn", "Thunderbird", "Tubarão", "Valkyrie", "Vigil", "Wamai", "Warden"
  ]
};

// Floors each map starts with (editable in the app).
window.SEED.floors = {
  default: ['Basement', '1F', '2F', 'Roof'],
  'Kafe Dostoyevsky': ['1F', '2F', '3F', 'Roof'],
  'Coastline': ['1F', '2F', 'Roof'],
  'Border': ['1F', '2F', 'Roof'],
  'Skyscraper': ['1F', '2F', 'Roof'],
  'Theme Park': ['1F', '2F', 'Roof']
};
