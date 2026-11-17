import { MUSIC_STYLES, type GameSpec, type MusicStyle } from '../../spec/schema';
import { SoundFx, collisionSound, type SoundName } from '../../engine/audio';
import { Music } from '../../engine/music';
import { h } from '../modal';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';

type Sfx = GameSpec['entities'][number]['onCollide']['sfx'];
const SFX: { id: Sfx; name: string }[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'pickup', name: 'Pickup' },
  { id: 'big', name: 'Big reward' },
  { id: 'hurt', name: 'Hurt' },
  { id: 'heal', name: 'Heal' },
  { id: 'pop', name: 'Pop' },
  { id: 'none', name: 'Silent' },
];
const MUSIC_NAMES: Record<MusicStyle, string> = { none: 'No music', chill: 'Chill', arcade: 'Arcade', spooky: 'Spooky', upbeat: 'Upbeat', dreamy: 'Dreamy' };
const MUSIC_HINT: Record<MusicStyle, string> = {
  none: 'Just sound effects',
  chill: 'Mellow, relaxed groove',
  arcade: 'Bright chiptune energy',
  spooky: 'Minor-key, mysterious',
  upbeat: 'Bouncy and cheerful',
  dreamy: 'Slow, floaty and soft',
};

const playIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
const stopIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

/** Sound Designer: background music style and volume, and the sound for every collision, with live previews. */
export function createSoundDesigner(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  const fx = new SoundFx();
  const music = new Music(() => fx.output());
  let previewing: MusicStyle | undefined;
  d.modal.close = ((close) => (opts?: { restoreFocus?: boolean }) => {
    music.stop();
    previewing = undefined;
    close(opts);
  })(d.modal.close.bind(d.modal));

  const render = (spec: GameSpec) => {
    let chosen: MusicStyle = spec.audio.music;
    let volume = spec.audio.volume;
    const sfx = new Map(spec.entities.map((e) => [e.id, e.onCollide.sfx]));

    const musicGrid = h('div', { class: 'music-grid', attrs: { role: 'radiogroup', 'aria-label': 'Background music' } });
    const drawMusic = () =>
      musicGrid.replaceChildren(
        ...MUSIC_STYLES.map((m) => {
          const card = h('div', { class: `music-card${m === chosen ? ' on' : ''}` });
          const pick = h('button', { type: 'button', class: 'music-pick', attrs: { role: 'radio', 'aria-checked': String(m === chosen) } }, h('strong', { textContent: MUSIC_NAMES[m] }), h('span', { textContent: MUSIC_HINT[m] }));
          pick.addEventListener('click', () => {
            chosen = m;
            drawMusic();
          });
          card.append(pick);
          if (m !== 'none') {
            const prev = h('button', { type: 'button', class: 'icon-only preview', attrs: { 'aria-label': previewing === m ? `Stop ${MUSIC_NAMES[m]}` : `Preview ${MUSIC_NAMES[m]}` } });
            prev.innerHTML = previewing === m ? stopIcon : playIcon;
            prev.addEventListener('click', () => {
              fx.unlock();
              if (previewing === m) {
                music.stop();
                previewing = undefined;
              } else {
                music.start(m, volume);
                previewing = m;
              }
              drawMusic();
            });
            card.append(prev);
          }
          return card;
        }),
      );
    drawMusic();

    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(volume), attrs: { 'aria-label': 'Music volume' } });
    vol.addEventListener('input', () => {
      volume = Number(vol.value);
      if (previewing) music.start(previewing, volume);
    });

    const sfxRows = spec.entities.map((e) => {
      const select = h('select', { attrs: { 'aria-label': `Sound when touching ${e.name}` } }, ...SFX.map((o) => new Option(o.name, o.id, false, o.id === sfx.get(e.id))));
      select.addEventListener('change', () => sfx.set(e.id, select.value as Sfx));
      const play = h('button', { type: 'button', class: 'icon-only preview', attrs: { 'aria-label': `Play ${e.name} sound` } });
      play.innerHTML = playIcon;
      play.addEventListener('click', () => {
        fx.unlock();
        fx.play(collisionSound({ ...e.onCollide, sfx: sfx.get(e.id) ?? 'auto' }));
      });
      const effect = [e.onCollide.score ? `${e.onCollide.score > 0 ? '+' : ''}${e.onCollide.score} score` : '', e.onCollide.lives ? `${e.onCollide.lives > 0 ? '+' : ''}${e.onCollide.lives} life` : ''].filter(Boolean).join(', ') || 'no effect';
      return h('div', { class: 'sfx-row' }, h('div', { class: 'setting-text' }, h('strong', { textContent: e.name }), h('span', { textContent: effect })), select, play);
    });

    const eventSounds = (['start', 'win', 'lose'] as SoundName[]).map((n) => {
      const b = h('button', { type: 'button' });
      b.innerHTML = `${playIcon}<span class="btn-label">${n[0].toUpperCase() + n.slice(1)}</span>`;
      b.addEventListener('click', () => {
        fx.unlock();
        fx.play(n);
      });
      return b;
    });

    d.body.replaceChildren(
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Background music' }), musicGrid, h('label', { class: 'volume-row' }, h('span', { textContent: 'Volume' }), vol)),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Collision sounds' }), h('div', { class: 'sfx-list' }, ...sfxRows)),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Game sounds' }), h('div', { class: 'tool-actions event-sounds' }, ...eventSounds)),
    );

    const save = h('button', { type: 'button', class: 'primary', textContent: 'Save sound design' });
    save.addEventListener('click', async () => {
      const next = structuredClone(spec);
      next.audio = { music: chosen, volume };
      for (const e of next.entities) e.onCollide.sfx = sfx.get(e.id) ?? e.onCollide.sfx;
      d.modal.close();
      await ctx.applyVersion(next, `Sound design: ${MUSIC_NAMES[chosen].toLowerCase()}`);
    });
    d.footer.replaceChildren(save);
  };

  return {
    open() {
      const game = ctx.current();
      if (!game) return;
      d.setTitle(`Sound Designer: ${game.title}`, 'Pick music and collision sounds; press play to preview');
      render(game.spec);
      d.modal.open();
    },
  };
}
