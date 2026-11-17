import type { GameSpec } from '../spec/schema';

type Sprite = GameSpec['sprites'][string];

/** SVG sprite as an <img> source. Images never run scripts, and the schema already rejects script-like SVG. */
export function spriteUrl(sprite: Sprite): string {
  const svg = sprite.svg.includes('xmlns=') ? sprite.svg : sprite.svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Pick the two sprites that best represent a game: the player and its main reward (or first entity).
 * The bigger of the two becomes the hero, so a rocket game shows the rocket and a fishing game shows a fish.
 */
export function coverSprites(spec: GameSpec): { hero: Sprite; sidekick?: Sprite } {
  const player = spec.sprites[spec.player.sprite];
  const featured = spec.entities.find((e) => e.onCollide.score > 0) ?? spec.entities[0];
  const other = featured ? spec.sprites[featured.sprite] : undefined;
  if (!other || other === player) return { hero: player };
  const area = (s: Sprite) => s.width * s.height;
  return area(other) > area(player) ? { hero: other, sidekick: player } : { hero: player, sidekick: other };
}

/** A miniature, lit, slightly tilted cover built from the game's own art and colours. */
export function renderCover(spec: GameSpec): HTMLElement {
  const { hero, sidekick } = coverSprites(spec);
  const cover = document.createElement('div');
  cover.className = 'game-cover';
  cover.setAttribute('aria-hidden', 'true');
  cover.style.setProperty('--c-bg', spec.theme.background);
  cover.style.setProperty('--c-a', spec.theme.primary);
  cover.style.setProperty('--c-b', spec.theme.accent);

  const stage = document.createElement('div');
  stage.className = 'cover-stage';
  const shadow = document.createElement('span');
  shadow.className = 'cover-shadow';
  const heroImg = new Image();
  heroImg.className = 'cover-hero';
  heroImg.alt = '';
  heroImg.decoding = 'async';
  heroImg.src = spriteUrl(hero);
  if (hero.faces === 'right') heroImg.classList.add('faces-right');
  stage.append(shadow, heroImg);
  if (sidekick) {
    const side = new Image();
    side.className = 'cover-side';
    side.alt = '';
    side.decoding = 'async';
    side.src = spriteUrl(sidekick);
    stage.append(side);
  }
  cover.append(stage);
  return cover;
}
