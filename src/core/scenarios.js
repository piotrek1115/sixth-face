// Po co w ogóle cele.
//
// Dopóki jedynym warunkiem zwycięstwa był dowódca, obie armie MUSIAŁY się
// zejść w jednym miejscu — „gra lustrzana" nie była wadą AI, tylko logiczną
// konsekwencją tego, że na planszy istniał dokładnie jeden punkt docelowy.
// Przy warbandzie pięciu kości ten sam brak dawał 13% partii kończonych
// wyczerpaniem: niedobitek uciekał, bo ucieczka nic nie kosztowała.
//
// Cel na planszy daje powód, żeby BYĆ GDZIEŚ — i jest czymś, co AI umie
// wycenić, w odróżnieniu od „trzymaj tę linię".
//
// Czego tu NIE ma i nie będzie: przebicia się na drugą stronę planszy. To jest
// dosłownie warunek zwycięstwa Dice Valley (Smart Flamingo, 2027).

import { ATTACK_LABELS } from './units.js';

/** Dwa środkowe rzędy, skrajne kolumny — cztery pola symetryczne względem
 *  obrotu o 180°, więc żadna strona nie ma bliżej. Środkowe kolumny zostają
 *  puste jako pas walki: kapliczki ciągną kostki NA BOKI, czyli dokładnie
 *  w poprzek osi, wzdłuż której kostki się poruszają. */
function shrineTiles(n) {
  const mid = Math.floor(n / 2);
  return [
    { x: 1, z: mid - 1 }, { x: n - 2, z: mid - 1 },
    { x: 1, z: mid }, { x: n - 2, z: mid },
  ];
}

/** JEDNA relikwia, nie dwie.
 *
 *  Przy dwóch symetrycznych każda strona brała swoją i wygrywała wyścig bez
 *  spotkania przeciwnika — 88% partii rozstrzygało się na punkty przy 3,2
 *  strat na dziesięć kości, czyli praktycznie bez walki. Dwie relikwie to
 *  dwa równoległe pasjanse. Jedna to przedmiot, o który trzeba się bić.
 *
 *  Na planszy o parzystym boku nie da się postawić jednej relikwii idealnie
 *  po środku, więc stoi o pole bliżej orków — a ludzie zaczynają. Czy ta
 *  wymiana wychodzi na zero, sprawdza pomiar win rate, nie deklaracja. */
function relicTiles(n) {
  const m = Math.floor(n / 2);
  return [{ x: m - 1, z: m }, { x: m, z: m - 1 }];
}

export const SCENARIOS = {
  // Wersja sprzed przebudowy — zostaje jako punkt odniesienia w pomiarach.
  leader: {
    label: 'Duel — kill the enemy commander',
    setup() {},
    scoreTarget: null,
    scoreTurn: () => 0,
  },

  shrines: {
    label: 'Shrines — hold ground you cannot fight from',
    scoreTarget: 10,
    setup(game) {
      game.objectives = shrineTiles(game.boardSize);
    },
    /** Kluczowa zasada: pole punktuje tylko wtedy, gdy stoisz na nim NIE
     *  pokazując ściany ataku. Nie da się jednocześnie trzymać i walczyć, bo
     *  góra kostki jest jedna — cel wchodzi w bezpośrednią licytację
     *  z gotowością bojową. */
    scoreTurn(game, faction) {
      let points = 0;
      for (const o of game.objectives) {
        const u = game.units.find((x) => x.alive && x.x === o.x && x.z === o.z);
        if (u && u.faction === faction && !ATTACK_LABELS.has(u.topLabel)) points++;
      }
      return points;
    },
  },

  // NIEZBALANSOWANY — patrz komentarz niżej. Zostaje jako eksperyment.
  relic: {
    label: 'Relic — hold the prize (UNBALANCED, 67:34 first-player)',
    // Dostawa jako warunek zwycięstwa nie zadziałała w ŻADNEJ konfiguracji:
    //   • dwie relikwie, „przynieś jedną" → 88-91% partii na punkty przy 3,1
    //     strat na dziesięć kości. Dwa równoległe pasjanse, zero spotkania.
    //   • jedna relikwia po środku → 39:59 dla orków. Na planszy o parzystym
    //     boku żadne pole nie leży w równej odległości od obu krawędzi, a
    //     pierwszy ruch tego nie kompensuje.
    //   • „przynieś obie" → 43% wyczerpania, bo kurier nie może się przekręcać.
    // Wniosek nie był liczbowy tylko konstrukcyjny: dostawa KOŃCZY kontakt,
    // a chcieliśmy go wymusić. Więc relikwia nie jest wyścigiem tylko łupem —
    // punktuje co turę, dopóki ją trzymasz. Zasada „niosąc nie możesz się
    // przekręcić" dopiero tutaj gryzie naprawdę: stoisz z cennym przedmiotem,
    // nie możesz się przezbroić, a oni idą.
    scoreTarget: 8,
    setup(game) {
      game.relics = relicTiles(game.boardSize).map((t) => ({ ...t, carrier: null, delivered: false }));
    },
    scoreTurn(game, faction) {
      return game.relics.filter((r) => {
        const u = r.carrier && game.units.find((x) => x.id === r.carrier);
        return u && u.alive && u.faction === faction;
      }).length;
    },
  },
};

export const DEFAULT_SCENARIO = 'leader';
