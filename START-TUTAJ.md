# Sixth Face — jak odpalić (2 minuty)

Potrzebujesz **Node.js 18 lub nowszego** — sprawdź `node -v`.
Jeśli nie masz: https://nodejs.org (wersja LTS).

## Uruchomienie

W terminalu, w tym katalogu:

```bash
npm install
npm run dev
```

Wejdź na adres, który wypisze się w terminalu (zwykle `http://localhost:5173`).

## Co zrobić najpierw

1. **▶ Auto-Play** — obejrzyj całą partię AI kontra AI, ~20 tur. Zobaczysz
   wszystkie mechaniki w akcji bez czytania czegokolwiek.
2. **? Rules** — pełna ściąga: akcje, koszty, drabinka obrażeń i wszystkie
   osiem kostek rozrysowanych jak siatka sześcianu.
3. Zagraj sam: kliknij jednostkę, potem cyjanowe pole (Step) albo przycisk
   Roll w panelu. Czerwone pole to atak — panel mówi wprost, czy rozbroi,
   zrani, czy zabije.
4. **✥ Custom setup** — pusta plansza, stawiasz co chcesz i gdzie chcesz.
   Świetne do sprawdzenia pojedynczego starcia jedna kość na jedną.

## Sedno w trzech zdaniach

Każda jednostka to kość D6. Nie przesuwasz pionka — **przetaczasz kość**, więc
ruch jednocześnie zmienia pozycję i to, co kość ma na wierzchu, czyli jej
aktualną zdolność. Zero punktów życia i żetonów: stan jednostki *jest* ścianką.

## Reszta

Pełny opis mechaniki, uzasadnienie decyzji balansowych (z pomiarami), otwarte
pytania i pomysł na rozwój — w **README.md**.

Testy logiki, bez przeglądarki:

```bash
npm test
```
