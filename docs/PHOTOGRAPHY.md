# Photography guide

The site currently uses original illustrations (see `src/config/images.ts`). Replace them with real
photography when available. Only use photos SAMSAL owns or has a clear licence to use commercially.

## Licensing
- Best: photos of SAMSAL's real stock, warehouse and deliveries (you own them; also builds trust).
- Free libraries such as Unsplash, Pexels and Pixabay allow commercial use under their own licences, but
  read the licence for each image, avoid photos with visible brands, logos or identifiable people unless a
  release exists, and keep a record (URL + photographer + date) of every image used.
- Paid stock (Shutterstock, Adobe Stock, iStock) is fine with a standard licence.
- Never use images of other companies' branded products as if they were yours.

## Suggested shot list
| Slot (key in images.ts)        | Subject                                             | Size (min) | Crop |
| ------------------------------ | --------------------------------------------------- | ---------- | ---- |
| `hero`                         | Warehouse shelving, pallets or a delivery vehicle   | 2000x1500  | 4:3  |
| `introduction`                 | Goods being checked or packed                       | 1600x1200  | 4:3  |
| `cleaning-supplies`            | Neutral, unbranded cleaning products                | 1600x1200  | 4:3  |
| `hygiene-supplies`             | Dispensers, tissue, gloves in a washroom setting    | 1600x1200  | 4:3  |
| `stationery-office-supplies`   | Paper, notebooks, pens on a desk                    | 1600x1200  | 4:3  |
| `general-institutional-supplies` | Cartons on a pallet                               | 1600x1200  | 4:3  |
| Industries (6 keys)            | Office, school, hotel, property, NGO, public office | 1600x1200  | 4:3  |

Keep subjects relevant and honest: do not show products SAMSAL does not supply.

## Technical
- JPG or WebP, under about 400 KB each after export (e.g. squoosh.app). Next.js resizes automatically.
- Write specific alt text: what is in the picture, not "image".
- Put files in `public/images/photos/` and update `src/config/images.ts`.
