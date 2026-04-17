import type { RaceId } from '../types/race.js';

const PREFIXES: Record<RaceId, string[]> = {
  elf: [
    'Ael', 'Cel', 'Eil', 'Fae', 'Gal', 'Ith', 'Lir', 'Mael', 'Nol', 'Sil', 'Thal', 'Vael',
    'Aur', 'Cae', 'Dae', 'Eol', 'Fin', 'Glor', 'Hal', 'Ior', 'Kel', 'Lor', 'Nal', 'Rin',
    // New
    'Ael', 'Bel', 'Cir', 'Del', 'Elar', 'Fael', 'Gil', 'Hael', 'Ilm', 'Kal', 'Lael', 'Mel',
    'Nir', 'Orel', 'Pael', 'Quel', 'Rael', 'Sael', 'Tel', 'Ulm', 'Vir', 'Wal', 'Yael', 'Zael',
    'Ath', 'Bael', 'Cor', 'Dur', 'Eld', 'Fir', 'Gar', 'Hir', 'Ith', 'Jael', 'Kir', 'Lir',
    'Myr', 'Nael', 'Oth', 'Per', 'Quel', 'Ril', 'Sol', 'Tar', 'Und', 'Val', 'Wil', 'Zel',
  ],
  dwarf: [
    'Brok', 'Dur', 'Gim', 'Gor', 'Kaz', 'Mor', 'Thor', 'Bal', 'Dun', 'Grun', 'Khor', 'Thur',
    'Bor', 'Dol', 'Fal', 'Hak', 'Krag', 'Nol', 'Rug', 'Skar', 'Tor', 'Ulf', 'Var', 'Zor',
    // New
    'Arn', 'Bral', 'Crag', 'Drak', 'Erd', 'Fjol', 'Grak', 'Hald', 'Irn', 'Jok', 'Kol', 'Lod',
    'Mak', 'Nar', 'Ork', 'Prak', 'Rok', 'Stok', 'Trak', 'Uld', 'Vrak', 'Wok', 'Yorn', 'Zak',
    'Ald', 'Brek', 'Chor', 'Drok', 'Eld', 'Frak', 'Gol', 'Hork', 'Igr', 'Jur', 'Krom', 'Lok',
    'Mord', 'Nork', 'Olm', 'Prak', 'Rak', 'Skol', 'Thorn', 'Und', 'Vorn', 'Wrak', 'Yak', 'Zum',
  ],
  human: [
    'Ald', 'Bran', 'Cor', 'Edm', 'Gar', 'Hal', 'Lor', 'Mar', 'Ric', 'Wil', 'Rod', 'Leo',
    'Art', 'Ced', 'Dav', 'Fer', 'Hen', 'Jas', 'Mal', 'Nor', 'Raf', 'Ste', 'Val', 'Zan',
    // New
    'Alb', 'Bar', 'Cal', 'Dan', 'Elr', 'Fran', 'Gil', 'Har', 'Ian', 'Jon', 'Ken', 'Lan',
    'Mag', 'Nath', 'Olf', 'Per', 'Quel', 'Rob', 'Sam', 'Thom', 'Ulr', 'Vic', 'War', 'Yor',
    'And', 'Bel', 'Cam', 'Dir', 'Ern', 'Ful', 'Gra', 'Hug', 'Iri', 'Jal', 'Kir', 'Luc',
    'Mir', 'Ned', 'Osh', 'Pav', 'Rad', 'Sig', 'Tar', 'Urs', 'Ven', 'Wes', 'Xal', 'Zev',
  ],
  halfelf: [
    'Aer', 'Bri', 'Dar', 'Ele', 'Fen', 'Ilv', 'Lyn', 'Mir', 'Nev', 'Sel', 'Tha', 'Vel',
    'Aes', 'Cal', 'Dri', 'Eir', 'Fal', 'Gwe', 'Hal', 'Ira', 'Kai', 'Lor', 'Nal', 'Sar',
    // New
    'Ael', 'Bel', 'Cyr', 'Del', 'Eri', 'Fir', 'Gal', 'Hel', 'Ila', 'Jes', 'Kae', 'Lel',
    'Mae', 'Ner', 'Ori', 'Pel', 'Rae', 'Syl', 'Tal', 'Uri', 'Val', 'Wyn', 'Xel', 'Yri',
    'Ari', 'Bae', 'Cel', 'Dir', 'Ela', 'Fae', 'Gil', 'Hir', 'Ith', 'Jal', 'Kir', 'Lyr',
    'Mel', 'Nil', 'Ola', 'Pir', 'Rel', 'Sel', 'Tir', 'Ula', 'Vil', 'Wyr', 'Xar', 'Zel',
  ],
  orc: [
    'Azg', 'Bol', 'Dro', 'Ghr', 'Kro', 'Mog', 'Nar', 'Rog', 'Sha', 'Urk', 'Zug', 'Gra',
    'Bur', 'Dak', 'Gor', 'Hru', 'Kag', 'Lur', 'Mor', 'Org', 'Raz', 'Sna', 'Thr', 'Vor',
    // New
    'Agh', 'Bra', 'Cru', 'Dug', 'Erg', 'Fro', 'Gru', 'Hrk', 'Irg', 'Jag', 'Kru', 'Lug',
    'Mak', 'Nug', 'Ork', 'Pug', 'Rak', 'Shr', 'Tug', 'Urg', 'Vru', 'Wrg', 'Yag', 'Zrk',
    'Arg', 'Bru', 'Drg', 'Gak', 'Hag', 'Krg', 'Lak', 'Mog', 'Nrg', 'Ork', 'Prg', 'Rug',
    'Sag', 'Trk', 'Ulg', 'Vrk', 'Wag', 'Xrg', 'Yug', 'Zag', 'Grk', 'Brg', 'Drk', 'Frg',
  ],
  giant: [
    'Bor', 'Fjr', 'Gro', 'Hyr', 'Jot', 'Kol', 'Myr', 'Rag', 'Sto', 'Thr', 'Ygg', 'Ulf',
    'Aeg', 'Ber', 'Dra', 'Fen', 'Gor', 'Hel', 'Jor', 'Kra', 'Nor', 'Ost', 'Sur', 'Vig',
    // New
    'Ald', 'Bjr', 'Cra', 'Dor', 'Eld', 'Fro', 'Gri', 'Hrm', 'Ild', 'Jyr', 'Kir', 'Lor',
    'Mod', 'Nyr', 'Ord', 'Pyr', 'Ror', 'Skr', 'Tor', 'Und', 'Vyr', 'Wor', 'Yr', 'Zor',
    'Arm', 'Bra', 'Col', 'Dyr', 'Erd', 'Fyr', 'Gol', 'Hrd', 'Ird', 'Jol', 'Kyr', 'Lyr',
    'Myr', 'Nrd', 'Olf', 'Prd', 'Ryr', 'Sol', 'Tyr', 'Urd', 'Vol', 'Wyr', 'Yrd', 'Zyr',
  ],
  goblin: [
    'Bix', 'Dri', 'Fiz', 'Gri', 'Kri', 'Nix', 'Pik', 'Rik', 'Ski', 'Tik', 'Wiz', 'Zik',
    'Bik', 'Dak', 'Fli', 'Gob', 'Jix', 'Lix', 'Mik', 'Nik', 'Plix', 'Sni', 'Trix', 'Vix',
    // New
    'Brik', 'Crik', 'Diz', 'Fik', 'Glix', 'Hik', 'Ixi', 'Jik', 'Klik', 'Liz', 'Mix', 'Niz',
    'Oxi', 'Priz', 'Quik', 'Riz', 'Slix', 'Triz', 'Uxi', 'Viz', 'Wrix', 'Xik', 'Yiz', 'Zix',
    'Blip', 'Clix', 'Drix', 'Flik', 'Grik', 'Hrix', 'Irik', 'Jrix', 'Krix', 'Lix', 'Mrix', 'Nrik',
    'Prix', 'Qrik', 'Rrix', 'Srik', 'Trik', 'Urik', 'Vrik', 'Wrik', 'Xrix', 'Yrik', 'Zrik', 'Briz',
  ],
  halforc: [
    'Bru', 'Dra', 'Gor', 'Hak', 'Kul', 'Mur', 'Rak', 'Ska', 'Tor', 'Vok', 'Zar', 'Gul',
    'Bak', 'Dru', 'Gra', 'Hul', 'Kar', 'Lak', 'Mok', 'Ral', 'Sar', 'Tul', 'Vak', 'Zur',
    // New
    'Ard', 'Bor', 'Cra', 'Dor', 'Erk', 'Fra', 'Gur', 'Hor', 'Irk', 'Jor', 'Kor', 'Lor',
    'Mor', 'Nor', 'Ork', 'Por', 'Rok', 'Sor', 'Tur', 'Urk', 'Vor', 'Wor', 'Yar', 'Zok',
    'Ark', 'Bra', 'Cul', 'Dak', 'Erl', 'Fok', 'Gok', 'Hrak', 'Irl', 'Jak', 'Krak', 'Lur',
    'Mrak', 'Nok', 'Orl', 'Prak', 'Rul', 'Srak', 'Trak', 'Url', 'Vrak', 'Wrak', 'Yok', 'Zrak',
  ],
};

const SUFFIXES: Record<RaceId, string[]> = {
  elf: [
    'andor', 'aris', 'duin', 'ennon', 'ion', 'ithil', 'orin', 'wen', 'dris', 'anor', 'athor', 'iel',
    'alas', 'born', 'diel', 'eth', 'finn', 'gorn', 'hael', 'inar', 'kael', 'mir', 'niel', 'rion',
    // New
    'alion', 'brae', 'cael', 'dael', 'elith', 'fael', 'gael', 'hael', 'ilion', 'jael', 'kael', 'lael',
    'mael', 'nael', 'oliel', 'pael', 'rael', 'sael', 'tael', 'uael', 'vion', 'wael', 'yael', 'zael',
    'amir', 'bion', 'cwen', 'dion', 'erion', 'fion', 'grion', 'hion', 'iriel', 'jion', 'kriel', 'lion',
    'mriel', 'nion', 'oriel', 'prion', 'riel', 'srion', 'triel', 'uriel', 'vrion', 'wriel', 'yriel', 'zriel',
  ],
  dwarf: [
    'din', 'gar', 'grim', 'li', 'mund', 'nak', 'rik', 'sson', 'dor', 'bur', 'nir', 'dak',
    'bek', 'drim', 'gur', 'hild', 'kur', 'lom', 'mur', 'orn', 'rak', 'sten', 'tir', 'vak',
    // New
    'ard', 'brak', 'crim', 'dek', 'erd', 'frim', 'grak', 'hrim', 'ird', 'jek', 'krim', 'lak',
    'mek', 'nard', 'ord', 'prim', 'rok', 'skrim', 'trak', 'urd', 'vrim', 'wak', 'yak', 'zrim',
    'and', 'bord', 'crak', 'dord', 'erim', 'ford', 'gord', 'hord', 'irim', 'jord', 'kord', 'lord',
    'mord', 'nord', 'orak', 'pord', 'rord', 'sord', 'tord', 'urak', 'vord', 'word', 'yord', 'zord',
  ],
  human: [
    'ric', 'mund', 'win', 'bert', 'ard', 'ston', 'ford', 'ley', 'red', 'wen', 'ton', 'son',
    'ald', 'bel', 'dal', 'eth', 'gard', 'hart', 'lan', 'mar', 'ric', 'ston', 'vel', 'wick',
    // New
    'and', 'bor', 'cas', 'don', 'ern', 'fal', 'gal', 'ham', 'ian', 'jas', 'kel', 'lam',
    'man', 'nor', 'orn', 'pal', 'ran', 'sal', 'tan', 'urn', 'var', 'wal', 'yan', 'zan',
    'ael', 'bry', 'cel', 'dyn', 'eld', 'fry', 'gyn', 'hel', 'ild', 'jyn', 'keld', 'lyn',
    'meld', 'nyn', 'old', 'pyn', 'reld', 'syn', 'teld', 'uld', 'vyn', 'weld', 'yeld', 'zyn',
  ],
  halfelf: [
    'iel', 'ren', 'wyn', 'dra', 'lin', 'nor', 'sar', 'thi', 'ven', 'ara', 'diel', 'iel',
    'ael', 'bri', 'dal', 'ell', 'gwen', 'hal', 'ira', 'kal', 'mira', 'nora', 'shan', 'val',
    // New
    'aen', 'bael', 'ciel', 'dael', 'elen', 'fael', 'gael', 'hael', 'ilen', 'jael', 'kael', 'lael',
    'mael', 'nael', 'orien', 'pael', 'rael', 'sael', 'tael', 'urien', 'vael', 'wael', 'yael', 'zael',
    'arin', 'brin', 'crin', 'drin', 'erin', 'frin', 'grin', 'hrin', 'irin', 'jrin', 'krin', 'lrin',
    'mrin', 'nrin', 'orin', 'prin', 'rrin', 'srin', 'trin', 'urin', 'vrin', 'wrin', 'yrin', 'zrin',
  ],
  orc: [
    'ash', 'bur', 'duk', 'gar', 'gul', 'mak', 'nak', 'rok', 'tul', 'zag', 'rug', 'goth',
    'bak', 'dag', 'gash', 'kul', 'lug', 'mok', 'rag', 'skar', 'thak', 'vash', 'zul', 'grim',
    // New
    'akh', 'bruk', 'chak', 'druk', 'grak', 'hruk', 'kruk', 'mash', 'nruk', 'prak', 'rash', 'shruk',
    'trak', 'vruk', 'wruk', 'zruk', 'grash', 'brash', 'drash', 'krash', 'mrash', 'prash', 'srash', 'thrash',
    'agr', 'brug', 'darg', 'gurg', 'hurg', 'kurg', 'lurg', 'murg', 'nurg', 'purg', 'rurg', 'surg',
    'turg', 'vurg', 'wurg', 'xurg', 'yurg', 'zurg', 'grub', 'brub', 'drub', 'krub', 'mrub', 'prub',
  ],
  giant: [
    'mir', 'nar', 'skir', 'und', 'heim', 'gard', 'vald', 'brir', 'mund', 'stein', 'dor', 'tyr',
    'berg', 'dal', 'fell', 'grim', 'horn', 'keld', 'mark', 'rik', 'strom', 'vang', 'wald', 'yth',
    // New
    'and', 'bald', 'crag', 'dran', 'eld', 'fald', 'gran', 'hald', 'ild', 'jarn', 'kald', 'larn',
    'mald', 'narn', 'oald', 'parn', 'rald', 'sarn', 'tald', 'uarn', 'vald', 'warn', 'yald', 'zarn',
    'borg', 'dorg', 'forg', 'gorg', 'horg', 'jorg', 'korg', 'lorg', 'morg', 'norg', 'porg', 'rorg',
    'sorg', 'torg', 'uborg', 'vorg', 'worg', 'xorg', 'yorg', 'zorg', 'fjord', 'skald', 'thane', 'jarl',
  ],
  goblin: [
    'bit', 'dik', 'fix', 'gle', 'kle', 'nik', 'pip', 'rit', 'sik', 'tix', 'wak', 'zap',
    'bop', 'dax', 'fip', 'gak', 'jik', 'lop', 'mip', 'nap', 'pox', 'rix', 'tik', 'vix',
    // New
    'blit', 'crik', 'drix', 'frix', 'grix', 'hrix', 'irix', 'jrix', 'krix', 'lrix', 'mrix', 'nrix',
    'orix', 'prix', 'qrix', 'rrix', 'srix', 'trix', 'urix', 'vrix', 'wrix', 'xrix', 'yrix', 'zrix',
    'bak', 'dek', 'fik', 'gek', 'hik', 'jek', 'kik', 'lek', 'mek', 'nek', 'pek', 'rek',
    'sek', 'tek', 'uek', 'vek', 'wek', 'xek', 'yek', 'zek', 'blib', 'flib', 'glib', 'slib',
  ],
  halforc: [
    'ash', 'bak', 'dor', 'gor', 'kur', 'mok', 'rak', 'thar', 'vok', 'zul', 'nar', 'gur',
    'bor', 'dak', 'gash', 'hul', 'krag', 'lak', 'mor', 'rog', 'shar', 'tuk', 'vash', 'zar',
    // New
    'ard', 'brek', 'crak', 'drek', 'erk', 'frak', 'grek', 'hrek', 'irk', 'jrek', 'krek', 'lrek',
    'mrek', 'nrek', 'ork', 'prek', 'rrek', 'srek', 'trek', 'urk', 'vrek', 'wrek', 'yrek', 'zrek',
    'ald', 'bold', 'cold', 'dold', 'eld', 'fold', 'gold', 'hold', 'ild', 'jold', 'kold', 'lold',
    'mold', 'nold', 'oldr', 'pold', 'rold', 'sold', 'told', 'uld', 'vold', 'wold', 'yold', 'zold',
  ],
};

type LocaleTitles = Record<RaceId, string[]>;

const TITLES_ES: LocaleTitles = {
  elf: [
    'el Sabio', 'el Eterno', 'Hoja de Luna', 'el Luminoso', 'Canto Estelar', 'el Silvestre',
    'Sombra del Bosque', 'el Susurrante', 'Flecha de Plata', 'el Crepuscular', 'Raíz Ancestral', 'el Arcano',
    // New
    'el Guardián del Alba', 'Estrella del Norte', 'el Vidente', 'Hoja de Otoño', 'el Inmortal', 'Arco de Cristal',
    'el Pacificador', 'Río de Plata', 'el Sereno', 'Canto del Viento', 'el Soñador', 'Llama Plateada',
    'el Ancestro', 'Guardabosques', 'el Nebuloso', 'Pluma del Cielo', 'el Resplandeciente', 'Paso Ligero',
    'el Centinela', 'Brisa de Jade', 'el Armonioso', 'Rayo de Estrellas', 'el Vigilante', 'Manto de Niebla',
  ],
  dwarf: [
    'Martillo de Hierro', 'el Forjador', 'Puño de Piedra', 'el Minero', 'Yunque de Oro', 'el Pétreo',
    'Corona de Roca', 'el Inquebrantable', 'Barba de Fuego', 'el Excavador', 'Escudo de Granito', 'el Fundidor',
    // New
    'el Obstinado', 'Hacha de Diamante', 'el Incansable', 'Muro de Acero', 'el Subterráneo', 'Pico de Hierro',
    'el Guardián de las Minas', 'Cincel de Oro', 'el Maestro Artesano', 'Casco de Bronce', 'el Irrompible', 'Llama del Crisol',
    'el Ancestral', 'Gema del Abismo', 'el Tallador', 'Veta de Plata', 'el Guardián de la Fragua', 'Raíz de la Montaña',
    'el Eterno Forjador', 'Cota de Mallas', 'el Imperturbable', 'Cuarzo Ardiente', 'el Constructor', 'Runa de Hierro',
  ],
  human: [
    'el Valiente', 'el Conquistador', 'el Justo', 'el Estratega', 'el Audaz', 'el Noble',
    'el Unificador', 'el Invicto', 'Espada del Alba', 'el Soberano', 'el Magnánimo', 'el Visionario',
    // New
    'el Protector', 'Corona de Hierro', 'el Diplomático', 'Estandarte de Oro', 'el Pionero', 'Mano Firme',
    'el Libertador', 'Escudo del Pueblo', 'el Comandante', 'Lanza del Sur', 'el Fundador', 'Voz del Trueno',
    'el Patriarca', 'Bastión del Reino', 'el Reformador', 'Cruz del Norte', 'el Guardián', 'Hierro y Sangre',
    'el Indomable', 'Bandera de Guerra', 'el Sabio de la Corte', 'Puente de Reinos', 'el Heredero', 'Manto de Gloria',
  ],
  halfelf: [
    'el Errante', 'el Mediador', 'el Versátil', 'Dos Mundos', 'el Diplomático', 'el Dual',
    'el Caminante', 'el Equilibrado', 'Sangre Mezclada', 'el Peregrino', 'el Adaptable', 'el Armonioso',
    // New
    'el Puente', 'Senda de Plata', 'el Intérprete', 'Herencia Doble', 'el Viajero', 'Mano Abierta',
    'el Empatía', 'Lazo de Dos Tierras', 'el Fluido', 'Canto Híbrido', 'el Resiliente', 'Paso entre Mundos',
    'el Astuto', 'Vínculo Ancestral', 'el Explorador', 'Rostro Cambiante', 'el Negociador', 'Eco de los Bosques',
    'el Sabio de Dos Cortes', 'Heraldo del Crepúsculo', 'el Libre', 'Raíz y Corona', 'el Navegante', 'Horizonte Partido',
  ],
  orc: [
    'el Feroz', 'Rompe Huesos', 'el Destructor', 'Sangre de Guerra', 'el Implacable', 'el Brutal',
    'Colmillo de Hierro', 'el Despiadado', 'Puño de Trueno', 'el Carnicero', 'Grito de Batalla', 'el Asolador',
    // New
    'el Sanguinario', 'Cráneo de Fuego', 'el Berserker', 'Furia Roja', 'el Aplastador', 'Mandíbula de Acero',
    'el Temible', 'Zarpa de Sombra', 'el Invasor', 'Hueso y Sangre', 'el Warlord', 'Ojo de Tormenta',
    'el Devastador', 'Marca de Guerra', 'el Incendiario', 'Diente de Dragón', 'el Salvaje', 'Hacha Rota',
    'el Insaciable', 'Trueno del Pantano', 'el Verdugo', 'Cadena de Hierro', 'el Cazador', 'Garra Carmesí',
  ],
  giant: [
    'el Colosal', 'Paso de Trueno', 'el Inamovible', 'Cumbre Eterna', 'el Titánico', 'el Pétreo',
    'el Monumental', 'Puño de Montaña', 'el Imponente', 'Temblor de Tierra', 'el Coloso', 'el Ancestral',
    // New
    'el Formidable', 'Pico del Mundo', 'el Guardián de Cumbres', 'Avalancha Viviente', 'el Primigenio', 'Roca Eterna',
    'el Soberano de las Alturas', 'Ventisca del Norte', 'el Inquebrantable', 'Raíz del Continente', 'el Eterno', 'Muro del Horizonte',
    'el Magnífico', 'Cima de Hielo', 'el Pilar del Cielo', 'Glaciar Viviente', 'el Defensor de la Tierra', 'Rugido del Abismo',
    'el Portentoso', 'Nieve y Piedra', 'el Vigilante de las Nubes', 'Cumbre de Truenos', 'el Milenario', 'Eco de las Montañas',
  ],
  goblin: [
    'el Astuto', 'Dedos Rápidos', 'el Escurridizo', 'el Tramposo', 'el Ingenioso', 'Ojo Avizor',
    'el Furtivo', 'Cola de Rata', 'el Emboscador', 'Dientes Afilados', 'el Taimado', 'Sombra Veloz',
    // New
    'el Pícaro', 'Garra Ágil', 'el Ladrón', 'Paso Silencioso', 'el Trapero', 'Ojo de Cuervo',
    'el Saboteador', 'Daga Oculta', 'el Superviviente', 'Cola Ponzoñosa', 'el Merodeador', 'Boca de Embudo',
    'el Escoria', 'Uñas de Alambre', 'el Carroñero', 'Nariz de Sabueso', 'el Artero', 'Pies de Humo',
    'el Oportunista', 'Bolsillo Vacío', 'el Rebuscador', 'Mano Larga', 'el Escamoteador', 'Risa Macabra',
  ],
  halforc: [
    'el Fuerte', 'el Táctico', 'Doble Filo', 'el Resistente', 'el Adaptable', 'Puño y Astucia',
    'el Tenaz', 'Sangre Mixta', 'el Formidable', 'el Curtido', 'Hacha y Mente', 'el Imparable',
    // New
    'el Estratégico', 'Garras de Acero', 'el Veterano', 'Escudo Partido', 'el Superviviente', 'Fuerza y Razón',
    'el Mestizo', 'Hueso y Honor', 'el Protector', 'Espada y Palabra', 'el Guerrero Sabio', 'Paso Firme',
    'el Inclemente', 'Coraza de Cuero', 'el Pragmático', 'Marca del Exilio', 'el Inquebrantable', 'Sangre de Hierro',
    'el Cazador de Sombras', 'Ojo de Águila', 'el Vengador', 'Brazo de Piedra', 'el Nómada', 'Rugido Silencioso',
  ],
};

const TITLES_EN: LocaleTitles = {
  elf: [
    'the Wise', 'the Eternal', 'Moonblade', 'the Radiant', 'Starsong', 'the Sylvan',
    'Shadowleaf', 'the Whisperer', 'Silverarrow', 'the Twilight', 'Deeproot', 'the Arcane',
    // New
    'the Dawnguard', 'Northstar', 'the Seer', 'Autumnleaf', 'the Immortal', 'Crystalbow',
    'the Peacekeeper', 'Silverstream', 'the Serene', 'Windsong', 'the Dreamer', 'Silverflame',
    'the Ancestor', 'Forestwarden', 'the Nebulous', 'Skyfeather', 'the Resplendent', 'Lightstep',
    'the Sentinel', 'Jadebreeze', 'the Harmonious', 'Starbeam', 'the Watcher', 'Mistmantle',
  ],
  dwarf: [
    'Ironhammer', 'the Forger', 'Stonefist', 'the Miner', 'Goldanvil', 'the Stoneborn',
    'Rockcrown', 'the Unbreakable', 'Firebeard', 'the Delver', 'Graniteshield', 'the Smelter',
    // New
    'the Stubborn', 'Diamondaxe', 'the Tireless', 'Steelwall', 'the Subterranean', 'Ironpick',
    'the Mine Warden', 'Goldchisel', 'the Master Artisan', 'Bronzehelm', 'the Unshattered', 'Crucibleflame',
    'the Ancestral', 'Abyssgem', 'the Carver', 'Silvervein', 'the Forgeguard', 'Mountainroot',
    'the Eternal Smith', 'Chainmail', 'the Unperturbed', 'Blazingquartz', 'the Builder', 'Ironrune',
  ],
  human: [
    'the Brave', 'the Conqueror', 'the Just', 'the Strategist', 'the Bold', 'the Noble',
    'the Unifier', 'the Undefeated', 'Dawnblade', 'the Sovereign', 'the Magnanimous', 'the Visionary',
    // New
    'the Protector', 'Ironcrown', 'the Diplomat', 'Goldbanner', 'the Pioneer', 'Steadyhand',
    'the Liberator', 'Peopleshield', 'the Commander', 'Southlance', 'the Founder', 'Thundervoice',
    'the Patriarch', 'Realmbastion', 'the Reformer', 'Northcross', 'the Guardian', 'Iron and Blood',
    'the Indomitable', 'Warbanner', 'the Court Sage', 'Realmbridge', 'the Heir', 'Glorymantle',
  ],
  halfelf: [
    'the Wanderer', 'the Mediator', 'the Versatile', 'of Two Worlds', 'the Diplomat', 'the Dual',
    'the Wayfarer', 'the Balanced', 'Halfblood', 'the Pilgrim', 'the Adaptive', 'the Harmonious',
    // New
    'the Bridge', 'Silverpath', 'the Interpreter', 'Dual Heritage', 'the Traveler', 'Open Hand',
    'the Empathic', 'Twofold Bond', 'the Fluid', 'Hybrid Song', 'the Resilient', 'Worldstepper',
    'the Shrewd', 'Ancestral Link', 'the Explorer', 'Shifting Face', 'the Negotiator', 'Forestecho',
    'the Sage of Two Courts', 'Twilight Herald', 'the Free', 'Root and Crown', 'the Navigator', 'Split Horizon',
  ],
  orc: [
    'the Fierce', 'Bonecrusher', 'the Destroyer', 'Warblood', 'the Relentless', 'the Brutal',
    'Irontusk', 'the Merciless', 'Thunderfist', 'the Butcher', 'Warcry', 'the Ravager',
    // New
    'the Bloodthirsty', 'Fireskull', 'the Berserker', 'Red Fury', 'the Crusher', 'Steeljaw',
    'the Dreadful', 'Shadowclaw', 'the Invader', 'Blood and Bone', 'the Warlord', 'Stormeye',
    'the Devastator', 'Warmark', 'the Arsonist', 'Dragontooth', 'the Savage', 'Broken Axe',
    'the Insatiable', 'Swampthunder', 'the Executioner', 'Ironchain', 'the Hunter', 'Crimson Claw',
  ],
  giant: [
    'the Colossal', 'Thunderstep', 'the Immovable', 'Peakwarden', 'the Titanic', 'the Stoneborn',
    'the Monumental', 'Mountainfist', 'the Towering', 'Earthshaker', 'the Colossus', 'the Ancient',
    // New
    'the Formidable', 'Worldpeak', 'the Summit Guard', 'Living Avalanche', 'the Primordial', 'Everlasting Rock',
    'the Height Sovereign', 'Northblizzard', 'the Indestructible', 'Continent Root', 'the Timeless', 'Horizon Wall',
    'the Magnificent', 'Ice Summit', 'the Sky Pillar', 'Living Glacier', 'the Earth Defender', 'Abyss Roar',
    'the Portentous', 'Snow and Stone', 'the Cloud Watcher', 'Thunder Summit', 'the Millennial', 'Mountain Echo',
  ],
  goblin: [
    'the Cunning', 'Quickfingers', 'the Slippery', 'the Trickster', 'the Clever', 'Sharpeye',
    'the Sneaky', 'Rattail', 'the Ambusher', 'Sharpteeth', 'the Sly', 'Swiftshadow',
    // New
    'the Rogue', 'Nimbleclaw', 'the Thief', 'Silentstep', 'the Scrapper', 'Croweye',
    'the Saboteur', 'Hidden Dagger', 'the Survivor', 'Poisontail', 'the Prowler', 'Funnelmouth',
    'the Scum', 'Wiretalon', 'the Scavenger', 'Houndnose', 'the Wily', 'Smokefeet',
    'the Opportunist', 'Emptypocket', 'the Rummager', 'Longhand', 'the Pilferer', 'Ghastly Grin',
  ],
  halforc: [
    'the Mighty', 'the Tactician', 'Doubleedge', 'the Resilient', 'the Adaptive', 'Fist and Wit',
    'the Tenacious', 'Mixedblood', 'the Formidable', 'the Hardened', 'Axe and Mind', 'the Unstoppable',
    // New
    'the Strategic', 'Steelclaws', 'the Veteran', 'Split Shield', 'the Survivor', 'Strength and Reason',
    'the Halfbreed', 'Bone and Honor', 'the Protector', 'Sword and Word', 'the Wise Warrior', 'Steadystep',
    'the Merciless', 'Leathershell', 'the Pragmatic', 'Exile Mark', 'the Unbreakable', 'Ironblood',
    'the Shadowhunter', 'Eagleeye', 'the Avenger', 'Stonearm', 'the Nomad', 'Silent Roar',
  ],
};

const TITLES: Record<string, LocaleTitles> = {
  es: TITLES_ES,
  en: TITLES_EN,
};

/** Generate a random name for a given race using a simple seed */
export function generateName(raceId: RaceId, seed?: number): string {
  const s = seed ?? Math.floor(Math.random() * 100000);
  const prefixes = PREFIXES[raceId];
  const suffixes = SUFFIXES[raceId];
  const prefix = prefixes[s % prefixes.length];
  const suffix = suffixes[Math.floor(s / prefixes.length) % suffixes.length];
  return prefix + suffix;
}

/** Generate a full name with a locale-appropriate title */
export function generateFullName(raceId: RaceId, seed?: number, locale: string = 'en'): string {
  const s = seed ?? Math.floor(Math.random() * 100000);
  const name = generateName(raceId, s);
  const titleSet = TITLES[locale] ?? TITLES_EN;
  const titles = titleSet[raceId];
  const title = titles[Math.floor(s / 7) % titles.length];
  return `${name} ${title}`;
}
