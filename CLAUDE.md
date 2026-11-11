## ART RULES (обов'язково для будь-якого візуалу)

### Генерація
- Модель: flux-2-klein-9b. Завжди input_image_0 = assets/ref/style_ref_512.png
  (зменшена копія еталона assets/ref/style_ref.png: Workers AI не приймає референси, більші за 512 px).
- Якщо асет має пасувати до вже затвердженого — input_image_1 = цей затверджений асет (теж не більше 512 px).
- Промпт = [ОБ'ЄКТ] + [КОМПОЗИЦІЯ] + STYLE_BLOCK. Нічого більше.
- FLUX не розуміє заперечень: НЕ писати "no X" / "without X". Описувати лише те, що МАЄ бути.
- Заборонені слова: beautiful, stunning, vibrant, glowing, magical, cinematic, epic,
  highly detailed, 4k, 8k, realistic, photorealistic, 3D, render, glossy, shiny,
  lens flare, sun rays, god rays, bokeh.
- Окремі об'єкти генерувати на "flat solid pure green background" (потім chroma key). Ніколи на білому.
- Кожен асет: 4 варіанти з різними seed → показати власнику → він обирає.
- Усі промпти, seed, модель і референси записувати в assets/prompts.md (scripts/gen.mjs дописує сам).

Запуск:
node scripts/gen.mjs --prompt "..." --ref assets/ref/style_ref_512.png [--ref2 <затверджений>] --seed 123 --out assets/raw/<ім'я>.png

### STYLE_BLOCK (додавати в кінець КОЖНОГО промпту)
hand-painted watercolor illustration on textured cream paper, visible paper grain,
soft wet-on-wet edges with pigment blooms, thin uneven sepia ink outline,
muted earthy palette of sage green, dusty blue, warm cream, faded brick red and ochre,
gentle flat daylight, vintage children's picture book style

### Код
- ЗАБОРОНЕНО малювати UI, кнопки, іконки, HUD, персонажів, птахів через
  Graphics / Canvas / CSS-фігури / градієнти. Тільки PNG/WebP-асети з assets/.
- Панелі й кнопки використовувати як 9-slice (NineSlice), щоб краї не розтягувались.
- Шрифти: заголовки — "Patrick Hand" (або "Caveat"), текст і цифри — "Nunito" 700.
  Колір тексту — темна сепія #3b2f2a. Не використовувати білий текст з тінню.
- Поверх ігрового екрана — оверлей assets/ui/paper_overlay.webp, blend MULTIPLY, alpha 0.12–0.18.
- Сонце: без променів і лінз-флеру, яскравість −40–50%.

### Постобробка (після КОЖНОЇ генерації)
python scripts/normalize_assets.py <вхід> <вихід> [--size 512]
