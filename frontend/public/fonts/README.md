# Local fonts

All fonts are redistributed under the adjacent SIL Open Font License files. Source glyphs were retained; TTF files were compressed to WOFF2 with FontTools.

| File | Upstream | License |
| --- | --- | --- |
| Geist-Variable.woff2 | https://github.com/google/fonts/tree/main/ofl/geist | geist-OFL.txt |
| GeistMono-Variable.woff2 | https://github.com/google/fonts/tree/main/ofl/geistmono | geistmono-OFL.txt |
| NotoSansSC-Variable.woff2 | https://github.com/google/fonts/tree/main/ofl/notosanssc | notosanssc-OFL.txt |
| MaShanZheng-Regular.woff2 | https://github.com/google/fonts/tree/main/ofl/mashanzheng | MaShanZheng-OFL.txt |
| InstrumentSerif-Italic.woff2 | https://github.com/google/fonts/tree/main/ofl/instrumentserif | InstrumentSerif-OFL.txt |

Body fonts use `next/font/local`; decorative fonts use scoped `@font-face` in the landing CSS module. Browser runtime and production builds need no font CDN requests.
