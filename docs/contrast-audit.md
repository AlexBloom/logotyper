# Grayscale contrast audit

Measured from browser-computed styles before and after the logotyper rebrand on 2026-11-17. Ratios use WCAG relative luminance. Each sampled foreground/background pairing retains or improves its former contrast; the lowest new text ratio in this sample is 5.30:1.

| Interface role | Previous | Grayscale |
| --- | ---: | ---: |
| `.sources` | 13.14:1 | 15.46:1 |
| `.section>summary` | 13.14:1 | 15.46:1 |
| `.hint` | 3.99:1 | 6.52:1 |
| `#status` | 3.45:1 | 6.52:1 |
| `.card header` | 14.33:1 | 15.46:1 |
| `.card footer` | 4.36:1 | 6.52:1 |
| `button.active` | 6.91:1 | 21.00:1 |
| `button:not(.active):not(:disabled)` | 13.60:1 | 18.10:1 |
| `.text-input textarea` | 14.19:1 | 21.00:1 |
| `#metadata dt` | 3.99:1 | 6.52:1 |
| `main>footer` | 3.45:1 | 5.30:1 |
| `.provider span` | 4.13:1 | 7.64:1 |
| `#drop` | 13.14:1 | 18.10:1 |
| `label` | 13.14:1 | 15.46:1 |

Sample covers sidebar copy, headings, status, card headers/footers, active and inactive buttons, text entry, inspector labels, provider notes and drop zone. Preview text is now black on white (21:1). Focus and primary control outlines are black. All stylesheet color literals are neutral; the audit does not simulate OS-native popup menu colors or every possible user/font glyph.
