#!/usr/bin/env bash
# Генерує ігрові звуки на Mirelo SFX 1.5: кожен звук у 4 варіантах (seed 11/22/33/44) в assets/raw/sfx/.
# Запуск: bash scripts/gen_sfx_batch.sh [назва ...]   (без аргументів — усі звуки)
set -u
cd "$( dirname "$0" )/.."

declare -A PROMPT DUR
PROMPT[click]="a single soft wooden button click, short and crisp, cozy game interface sound"; DUR[click]=1
PROMPT[land]="a wicker basket gently landing on soft grass, a short soft thud with a light wicker creak"; DUR[land]=1.5
PROMPT[bump]="a wicker basket bumping hard against a rock, a short wooden knock with a creak"; DUR[bump]=1
PROMPT[stamp]="picking up a paper postage stamp, a bright short sparkle chime with a light paper rustle"; DUR[stamp]=1.5
PROMPT[deliver]="a paper letter dropping into a small metal mailbox, a soft paper slide and a small metal lid clink"; DUR[deliver]=1.5
PROMPT[pop]="a big cloth balloon bursting with a loud pop, then air hissing out and fabric flapping"; DUR[pop]=2
PROMPT[splash]="an object falling into calm sea water, a medium splash with bubbles"; DUR[splash]=2
PROMPT[star]="a single soft bright glockenspiel note with a gentle sparkle shimmer"; DUR[star]=1.5
PROMPT[win]="a short cheerful victory jingle played on celesta, pizzicato strings and soft accordion, whimsical storybook mood"; DUR[win]=3
PROMPT[buy]="soft coins jingling into a cloth purse with a gentle little bell, a pleasant purchase sound"; DUR[buy]=1.5
PROMPT[burner]="a hot air balloon propane burner roaring steadily, a continuous even whoosh of flame"; DUR[burner]=4

names=( "$@" )
[ ${#names[@]} -eq 0 ] && names=( click land bump stamp deliver pop splash star win buy burner )
for n in "${names[@]}"; do
  for s in 11 22 33 44; do
    node scripts/gen_audio.mjs --model mirelo:1@1 --prompt "${PROMPT[$n]}" --duration "${DUR[$n]}" --seed $s \
      --bitrate 128 --channels 1 --out "assets/raw/sfx/${n}_s${s}.mp3" 2>&1 | tail -1
  done
done
