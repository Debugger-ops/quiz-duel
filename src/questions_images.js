// Picture questions. Images are hosted by free public CDNs; answer options stay text.
// Add more from the in-app admin form (any image URL works).

const FLAGS = [
  ['in', 'India'], ['jp', 'Japan'], ['br', 'Brazil'], ['ca', 'Canada'], ['au', 'Australia'],
  ['de', 'Germany'], ['fr', 'France'], ['it', 'Italy'], ['es', 'Spain'], ['gb', 'United Kingdom'],
  ['us', 'United States'], ['cn', 'China'], ['ru', 'Russia'], ['kr', 'South Korea'], ['mx', 'Mexico'],
  ['ar', 'Argentina'], ['eg', 'Egypt'], ['za', 'South Africa'], ['ng', 'Nigeria'], ['ke', 'Kenya'],
  ['tr', 'Turkey'], ['sa', 'Saudi Arabia'], ['pk', 'Pakistan'], ['bd', 'Bangladesh'], ['lk', 'Sri Lanka'],
  ['np', 'Nepal'], ['id', 'Indonesia'], ['th', 'Thailand'], ['vn', 'Vietnam'], ['my', 'Malaysia'],
  ['sg', 'Singapore'], ['ph', 'Philippines'], ['nz', 'New Zealand'], ['ie', 'Ireland'], ['ch', 'Switzerland'],
  ['se', 'Sweden'], ['no', 'Norway'], ['nl', 'Netherlands'], ['gr', 'Greece'], ['pt', 'Portugal'],
  ['pl', 'Poland'], ['ua', 'Ukraine'], ['ir', 'Iran'], ['iq', 'Iraq'], ['il', 'Israel'],
  ['ae', 'United Arab Emirates'], ['co', 'Colombia'], ['cl', 'Chile'], ['pe', 'Peru'], ['cu', 'Cuba'],
]

const POKEMON = [
  [1, 'Bulbasaur'], [4, 'Charmander'], [7, 'Squirtle'], [25, 'Pikachu'], [39, 'Jigglypuff'],
  [52, 'Meowth'], [54, 'Psyduck'], [94, 'Gengar'], [129, 'Magikarp'], [133, 'Eevee'],
  [143, 'Snorlax'], [150, 'Mewtwo'], [6, 'Charizard'], [9, 'Blastoise'], [35, 'Clefairy'],
  [63, 'Abra'], [92, 'Gastly'], [104, 'Cubone'], [131, 'Lapras'], [149, 'Dragonite'],
  [151, 'Mew'], [152, 'Chikorita'], [175, 'Togepi'], [197, 'Umbreon'], [248, 'Tyranitar'],
  [258, 'Mudkip'], [282, 'Gardevoir'], [384, 'Rayquaza'], [448, 'Lucario'], [493, 'Arceus'],
]

// Wrong answers are picked by fixed offsets so the data is stable between runs.
function build(list, question, imageUrl) {
  const n = list.length
  return list.map(([id, name], i) => ({
    q: question,
    a: name,
    w: [list[(i + 7) % n][1], list[(i + 13) % n][1], list[(i + 29) % n][1]],
    image: imageUrl(id),
  }))
}

export const IMAGE_TOPICS = [
  { id: 'flags', name: 'Flag Quiz', icon: '🚩', color: '#f43f5e' },
  { id: 'pokemon', name: 'Who’s That Pokémon?', icon: '🐭', color: '#facc15' },
]

export const IMAGE_QUESTIONS = {
  flags: build(FLAGS, 'Which country’s flag is this?', (c) => `https://flagcdn.com/w320/${c}.png`),
  pokemon: build(
    POKEMON,
    'Which Pokémon is this?',
    (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  ),
}
