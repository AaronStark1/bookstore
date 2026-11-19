/**
 * Built-in specimen collection — FRONTEND_PROMPT.md §7.3.3.
 *
 * Twelve folios that keep the 3D shelf playable when the backend is
 * unreachable or MongoDB has not been seeded. They are invented demonstration
 * data: the titles, authors, publishers and ISBNs are fictional, and the cover
 * artwork is drawn procedurally (lib/procedural.ts) rather than loaded from
 * image files. Specimen folios cannot be purchased — their ids do not exist in
 * the database — so the detail sheet explains that instead of calling Stripe.
 */
import { makeCoverSvg, makeSpineStyle, svgToDataUri, type CoverPalette, type Motif } from '../lib/procedural'
import { hash32 } from '../lib/math'
import type { FoilKind, ShelfBook } from '../types'

interface Specimen {
  title: string
  author: string
  year: number
  edition: string
  pages: number
  price: number
  dprice: number
  publisher: string
  language: string
  category: string
  abstract: string
  motif: Motif
  palette: CoverPalette
  cloth: number
  foil: FoilKind
}

const SPECIMENS: Specimen[] = [
  {
    title: 'The Silent Valley',
    author: 'Haruo Minase',
    year: 1955,
    edition: 'First Edition',
    pages: 312,
    price: 1950,
    dprice: 1450,
    publisher: 'Kōseisha Press, Kyoto',
    language: 'English Edition',
    category: 'Rare Folio / Fiction',
    abstract:
      'A surveyor is sent to map a mountain valley whose villagers have agreed, generations ago, never to speak above a whisper. As the snow closes the pass he begins to understand what the silence is protecting — and what it has cost. Minase’s spare first novel is set here in the original quarto, with eleven tipped-in woodcut plates.',
    motif: 'peaks',
    palette: { bg: '#E4DCCB', ink: '#16181D', accent: '#5C6B3C', accent2: '#B4432E' },
    cloth: 1,
    foil: 'gold',
  },
  {
    title: 'An Atlas of Lost Weather',
    author: 'Ilse Varga',
    year: 1957,
    edition: 'Limited Edition of 400',
    pages: 268,
    price: 2400,
    dprice: 1850,
    publisher: 'Meridian & Daughters, Vienna',
    language: 'English',
    category: 'Rare Folio / Essays',
    abstract:
      'Forty-one short essays, each describing a kind of weather that no longer occurs: the brown fogs of river cities, the dry lightning of a drained marsh, a wind that once had a name. Varga writes as a meteorologist and a mourner at once. Bound with the folding isobar chart intact.',
    motif: 'rings',
    palette: { bg: '#D6DCE0', ink: '#1A2233', accent: '#1F3FB0', accent2: '#C99A2E' },
    cloth: 4,
    foil: 'white',
  },
  {
    title: 'The Blue Hour',
    author: 'Margit Halloran',
    year: 1959,
    edition: 'First Edition',
    pages: 224,
    price: 1750,
    dprice: 1300,
    publisher: 'Calder Lane Press, Dublin',
    language: 'English',
    category: 'Rare Folio / Fiction',
    abstract:
      'Over a single dusk in a harbour town, a night-telephone operator connects six calls that should never have reached one another. Halloran’s novella unfolds in real time, minute by minute, until the street lamps come on. An unusually clean copy in the publisher’s indigo cloth.',
    motif: 'moon',
    palette: { bg: '#1B2A4A', ink: '#EDE6D6', accent: '#E3C06A', accent2: '#B4432E' },
    cloth: 2,
    foil: 'gold',
  },
  {
    title: 'Cartographer of Moths',
    author: 'Teodor Brandt',
    year: 1961,
    edition: 'Second Printing',
    pages: 356,
    price: 1600,
    dprice: 1200,
    publisher: 'Nordlys Press, Bergen',
    language: 'English Edition',
    category: 'Rare Folio / Natural History',
    abstract:
      'Part field journal, part confession: an amateur lepidopterist spends thirty summers charting the night flights of moths across one fjord, and slowly realises the map he is drawing is of his own family. Illustrated throughout with the author’s wing diagrams.',
    motif: 'moths',
    palette: { bg: '#D9D0BA', ink: '#2B2118', accent: '#C99A2E', accent2: '#7A3E28' },
    cloth: 3,
    foil: 'gold',
  },
  {
    title: 'River of Salt',
    author: 'Elias Okonkwo-Reed',
    year: 1963,
    edition: 'First Edition',
    pages: 402,
    price: 2100,
    dprice: 1600,
    publisher: 'Harmattan House, London',
    language: 'English',
    category: 'Rare Folio / Fiction',
    abstract:
      'Three brothers inherit a salt works on an estuary that is moving inland a little further every year. A family saga told against the tide tables, where every chapter opens with the day’s high-water mark. The scarce first state, with the misprinted tide chart on page 9.',
    motif: 'waves',
    palette: { bg: '#DCD6C8', ink: '#15262A', accent: '#1E5A63', accent2: '#B4432E' },
    cloth: 7,
    foil: 'gold',
  },
  {
    title: 'The Glass Orchard',
    author: 'Sayo Kirishima',
    year: 1965,
    edition: 'First English Edition',
    pages: 198,
    price: 1500,
    dprice: 1150,
    publisher: 'Tokyo Book Arts',
    language: 'English Edition',
    category: 'Rare Folio / Poetry',
    abstract:
      'A sequence of sixty-four prose poems written in a greenhouse through one winter, each pane of glass a page. Kirishima counts frost, breath and pears with the same instrument. Printed letterpress on Echizen paper; this copy retains the glassine wrapper.',
    motif: 'grid',
    palette: { bg: '#CBD2C0', ink: '#1C2A22', accent: '#3F6B52', accent2: '#B4432E' },
    cloth: 10,
    foil: 'cobalt',
  },
  {
    title: 'Winter Arithmetic',
    author: 'Anders Lindqvist',
    year: 1968,
    edition: 'First Edition',
    pages: 286,
    price: 1700,
    dprice: 1250,
    publisher: 'Isbrytaren Press, Uppsala',
    language: 'English Edition',
    category: 'Rare Folio / Fiction',
    abstract:
      'A schoolteacher on a northern island keeps the ledger for a community that pays its debts in firewood, herring and favours. When the ice comes early, the sums stop balancing. A quiet, exact novel about what people owe each other when nothing else can be counted on.',
    motif: 'bars',
    palette: { bg: '#E3E4E1', ink: '#14171C', accent: '#1F3FB0', accent2: '#B4432E' },
    cloth: 11,
    foil: 'blind',
  },
  {
    title: 'Noon in Ashes',
    author: 'Corwin Mackery',
    year: 1971,
    edition: 'First Edition',
    pages: 384,
    price: 1800,
    dprice: 1350,
    publisher: 'Dry Creek Editions, Santa Fe',
    language: 'English',
    category: 'Rare Folio / Fiction',
    abstract:
      'After a fire takes the grasslands, a drover and a telegraph clerk cross the burn on foot with a single mule, following a wire that may no longer lead anywhere. Mackery strips the western down to light, distance and thirst. Publisher’s grey cloth with the vermilion sun device.',
    motif: 'sun',
    palette: { bg: '#D5D1C8', ink: '#17171A', accent: '#C0392B', accent2: '#17171A' },
    cloth: 9,
    foil: 'gold',
  },
  {
    title: 'Night Ferry to Otaru',
    author: 'Reiko Asahina',
    year: 1973,
    edition: 'First English Edition',
    pages: 244,
    price: 1650,
    dprice: 1250,
    publisher: 'Northern Sea Editions, Hokkaido',
    language: 'English Edition',
    category: 'Rare Folio / Fiction',
    abstract:
      'Nine passengers, one overnight crossing, and a purser who has been asked to deliver a letter to someone on board without being told to whom. Asahina’s chamber novel is as much about the sound of the engine as the people above it. With the fold-out deck plan.',
    motif: 'horizon',
    palette: { bg: '#18233B', ink: '#ECE5D3', accent: '#E0B04C', accent2: '#ECE5D3' },
    cloth: 8,
    foil: 'white',
  },
  {
    title: 'Thirteen Quiet Rooms',
    author: 'Beatrix Aldous',
    year: 1975,
    edition: 'Signed Limited Edition',
    pages: 176,
    price: 2600,
    dprice: 2100,
    publisher: 'The Lintel Press, Edinburgh',
    language: 'English',
    category: 'Rare Folio / Short Stories',
    abstract:
      'Thirteen stories, each confined to a single room: a waiting room, a darkroom, a room let by the week. Aldous allows nothing to happen and makes it unbearable. One of 250 copies signed by the author on the limitation leaf.',
    motif: 'rooms',
    palette: { bg: '#E6DED0', ink: '#1B1614', accent: '#8C2218', accent2: '#1B1614' },
    cloth: 0,
    foil: 'gold',
  },
  {
    title: 'The Paper Tide',
    author: 'Lucien Ferrand',
    year: 1977,
    edition: 'First Edition',
    pages: 330,
    price: 1550,
    dprice: 1150,
    publisher: 'Éditions du Quai, Marseille',
    language: 'English Edition',
    category: 'Rare Folio / Fiction',
    abstract:
      'An archivist in a port city discovers that the municipal records are being quietly rewritten, one shipping manifest at a time, and decides to keep a second, secret archive in the margins of unsold novels. A comedy of filing that turns, very slowly, into a thriller.',
    motif: 'tide',
    palette: { bg: '#E9E3D4', ink: '#141B33', accent: '#1F3FB0', accent2: '#C99A2E' },
    cloth: 10,
    foil: 'cobalt',
  },
  {
    title: 'A Lantern for the Drowned',
    author: 'Tomás Echeverri',
    year: 1980,
    edition: 'First English Edition',
    pages: 418,
    price: 1900,
    dprice: 1500,
    publisher: 'Marea Baja Press, Valparaíso',
    language: 'English Edition',
    category: 'Rare Folio / Fiction',
    abstract:
      'Each year a fishing town lights one lantern for every boat that did not come back. The year the lamplighter’s own son is lost, she refuses, and the harbour goes dark. Echeverri’s last novel, and his most generous. Deep teal cloth, top edge stained ochre.',
    motif: 'rays',
    palette: { bg: '#1E4347', ink: '#EFE8D8', accent: '#E0B04C', accent2: '#EFE8D8' },
    cloth: 7,
    foil: 'gold',
  },
]

export const FALLBACK_CATALOG: ShelfBook[] = SPECIMENS.map((sp, i) => {
  const id = `specimen-${String(i + 1).padStart(2, '0')}`
  const cover = svgToDataUri(
    makeCoverSvg({
      title: sp.title,
      author: sp.author,
      year: sp.year,
      no: i + 1,
      palette: sp.palette,
      motif: sp.motif,
      seed: hash32(sp.title),
    }),
  )
  return {
    id,
    live: false,
    cover,
    coverFallback: cover,
    gallery: [],
    year: sp.year,
    edition: sp.edition,
    spine: makeSpineStyle(sp.title, { cloth: sp.cloth, foil: sp.foil }),
    doc: {
      _id: id,
      title: sp.title,
      author: sp.author,
      noofpages: sp.pages,
      imageUrl: '',
      price: sp.price,
      dprice: sp.dprice,
      abstract: sp.abstract,
      publisher: sp.publisher,
      language: sp.language,
      // Placeholder numbers in the 979-8 demo style — not registered ISBNs.
      isbn: `979-8-0000-${String(1000 + i * 37).padStart(4, '0')}-${(i * 7) % 10}`,
      category: sp.category,
      UploadedImages: [],
      status: 'pending',
      userMail: 'archive@bibliotheca-obscura.example',
      brought: '',
    },
  }
})
