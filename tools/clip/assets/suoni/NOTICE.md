# Suoni di THE CLIP

Quattro WAV (48 kHz, 24 bit, stereo) usati da `render --suoni` / `make --suoni`. Sono renderizzati
dalla banca di **earshot** (github.com/Leonxlnx/earshot, MIT, © Leon Lin), versione 0.4.0, con
il comando `earshot sfx render`. earshot NON e' una dipendenza: il prodotto spedisce i WAV, e
earshot serve solo a rifarli (`strumenti\rigenera-suoni.ps1`).

| file | id nella banca | comando | durata | peso |
|---|---|---|---|---|
| `click.wav` | `pro_click/mouse` (seed 503102719) | `earshot sfx render pro_click/mouse -o click.wav --sr 48000 --peak -3` | 0.054 s | 15.5 KB |
| `key.wav` | `pro_typing_key/soft` (seed 1097657232) | `earshot sfx render pro_typing_key/soft -o key.wav --sr 48000 --peak -3 --dur 0.09` | 0.090 s | 26.0 KB |
| `zoom-in.wav` | `whoosh_fast/tight` (seed 1621782255) | `earshot sfx render whoosh_fast/tight -o zoom-in.wav --sr 48000 --peak -3 --dur 0.45 --apex 0.14` | 0.450 s | 129.6 KB |
| `zoom-out.wav` | `whoosh_fast/reverse` (seed 436489598) | `earshot sfx render whoosh_fast/reverse -o zoom-out.wav --sr 48000 --peak -3 --dur 0.6 --apex 0.25` | 0.600 s | 172.8 KB |

Tutti e quattro passano l'audit di earshot (`sfx check`: clean; `key.wav` e' reso a 0,09 s invece
dei 0,072 s nativi perche' alla durata nativa la coda e' tagliata a -44 dB e l'audit lo segnala).
Picco -3 dBFS; nel mix THE CLIP applica il guadagno per tipo di `SUONI` in `src/suoni.mjs` (click
0.9, tasto 0.6, zoom in 0.7, zoom out 0.55) per il volume globale `--suoni-volume`.

## Licenza

I suoni della banca di earshot sono generati da ricette (sintesi procedurale), rilasciati con
il resto del repository sotto licenza MIT:

```
MIT License

Copyright (c) 2026 Leon Lin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

Nessuno dei quattro e' una registrazione: `pro_click/*`, `pro_typing_key/*` e `whoosh_fast/*`
appartengono alla parte "forge" della banca (ricette), non ai 15 suoni "fit" da registrazioni CC0.
