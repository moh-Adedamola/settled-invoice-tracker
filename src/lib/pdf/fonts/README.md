# Vendored fonts

IBM Plex Sans and IBM Plex Mono, complete TTFs from
`github.com/IBM/plex` at `v6.4.0`, under the SIL Open Font License 1.1.

Vendored rather than fetched at render time so a CDN failure cannot become
a silent fallback to Helvetica, and **complete** rather than a webfont
subset: the Google Fonts latin cut is missing U+20A6 (naira), U+25CF,
U+25D0, U+25B2, U+25CB (status markers) and U+2248 (the approx mark).

Regenerate with `scripts/fetch-pdf-fonts.ts`.
