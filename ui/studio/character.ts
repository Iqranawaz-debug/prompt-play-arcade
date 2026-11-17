import { GameSpecSchema, formatIssues } from '../../spec/schema';
import type { Character } from '../../spec/tools';
import { fetchCharacter } from '../api';
import { spriteUrl } from '../cover';
import { h } from '../modal';
import { notify } from '../notifications';
import type { StudioContext } from './context';
import { createToolDialog, field, textarea } from './dialog';

const MOVEMENT = { free: 'Moves in all directions', horizontal: 'Moves left and right', vertical: 'Moves up and down' } as const;

/** Character Creator: describe appearance, personality, abilities and movement; get a sprite and stats. */
export function createCharacterCreator(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  const fields = {
    look: textarea('', 3, 300),
    personality: textarea('', 2, 300),
    abilities: textarea('', 2, 300),
    movement: textarea('', 2, 300),
  };
  fields.look.placeholder = 'e.g. a round orange cat astronaut in a glass helmet';
  fields.personality.placeholder = 'e.g. curious, a little clumsy, always hungry';
  fields.abilities.placeholder = 'e.g. very fast but fragile';
  fields.movement.placeholder = 'e.g. floats freely in every direction';

  const description = () =>
    [
      `Appearance: ${fields.look.value.trim()}`,
      fields.personality.value.trim() && `Personality: ${fields.personality.value.trim()}`,
      fields.abilities.value.trim() && `Abilities: ${fields.abilities.value.trim()}`,
      fields.movement.value.trim() && `Movement: ${fields.movement.value.trim()}`,
    ]
      .filter(Boolean)
      .join('\n');

  const background = () => ctx.current()?.spec.theme.background ?? '#1b2433';

  const showForm = () => {
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
    d.body.replaceChildren(
      h('p', { class: 'tool-muted', textContent: 'Describe your character. Abilities become speed and lives; movement becomes how it can move.' }),
      field('Appearance', fields.look, true),
      h('div', { class: 'tool-grid' }, field('Personality', fields.personality), field('Abilities', fields.abilities), field('Movement', fields.movement, true)),
      err,
    );
    const create = h('button', { type: 'button', class: 'primary', textContent: 'Create character' });
    create.addEventListener('click', () => {
      if (fields.look.value.trim().length < 3) {
        err.textContent = 'Describe the appearance first.';
        fields.look.focus();
        return;
      }
      void make();
    });
    d.footer.replaceChildren(create);
  };

  const showResult = (c: Character) => {
    const current = ctx.current();
    const stage = h('div', { class: 'char-stage', attrs: { style: `background:${background()}` } });
    const img = h('img', { src: spriteUrl(c.sprite), alt: `${c.name} sprite` });
    img.style.width = `${c.sprite.width * 3}px`;
    img.style.height = `${c.sprite.height * 3}px`;
    stage.append(img);
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
    d.body.replaceChildren(
      h(
        'div',
        { class: 'char-result' },
        stage,
        h(
          'div',
          { class: 'char-info' },
          h('h3', { class: 'char-name', textContent: c.name }),
          h('p', { textContent: c.personality }),
          h('div', { class: 'char-stats' }, h('span', { class: 'stat', textContent: `Speed ${c.speed}` }), h('span', { class: 'stat', textContent: `${c.lives} ${c.lives === 1 ? 'life' : 'lives'}` }), h('span', { class: 'stat', textContent: MOVEMENT[c.controls] })),
          h('p', { class: 'tool-muted', textContent: c.abilities }),
          c.quotes.length ? h('ul', { class: 'char-quotes' }, ...c.quotes.map((q) => h('li', { textContent: `"${q}"` }))) : null,
        ),
      ),
      err,
    );

    const apply = h('button', { type: 'button', class: 'primary', textContent: current ? `Use in "${current.title}"` : 'Use in current game', disabled: !current });
    const newGame = h('button', { type: 'button', textContent: 'Use in a new game' });
    const again = h('button', { type: 'button', class: 'ghost', textContent: 'Try again' });
    const edit = h('button', { type: 'button', class: 'ghost', textContent: 'Edit description' });
    apply.addEventListener('click', async () => {
      const game = ctx.current();
      if (!game) return;
      const spec = structuredClone(game.spec);
      const id = 'custom_hero';
      spec.sprites[id] = c.sprite;
      spec.player = { ...spec.player, sprite: id, speed: c.speed, lives: c.lives, controls: c.controls };
      // Drop the old player sprite if nothing else uses it.
      const old = game.spec.player.sprite;
      if (old !== id && !spec.entities.some((e) => e.sprite === old)) delete spec.sprites[old];
      const result = GameSpecSchema.safeParse(spec);
      if (!result.success) {
        err.textContent = `This character doesn't fit "${game.title}" as is:\n${formatIssues(result.error)}\nTry a faster character, or remix the game after applying.`;
        return;
      }
      d.modal.close();
      await ctx.applyVersion(result.data, `New player character: ${c.name}`);
    });
    newGame.addEventListener('click', () => {
      ctx.setPrompt(`The player is ${c.name}: ${fields.look.value.trim()}. Personality: ${c.personality}. Abilities: ${c.abilities}. ${MOVEMENT[c.controls]}.\nGame idea: `);
      d.modal.close();
      notify('info', `${c.name} added to the prompt`, 'Finish the game idea, then Generate.');
    });
    again.addEventListener('click', () => void make());
    edit.addEventListener('click', showForm);
    d.footer.replaceChildren(edit, again, newGame, apply);
  };

  const make = async () => {
    const signal = d.busy('Designing your character…');
    try {
      const c = await fetchCharacter(description(), background(), signal);
      d.setTitle(`Character: ${c.name}`, 'Preview on the game background');
      showResult(c);
    } catch (err) {
      if (signal.aborted) return;
      d.error('Could not create the character', (err as Error).message);
      const back = h('button', { type: 'button', textContent: 'Back' });
      back.addEventListener('click', showForm);
      d.footer.replaceChildren(back);
    }
  };

  return {
    open() {
      d.setTitle('Character Creator', 'Appearance, personality, abilities and movement');
      showForm();
      d.modal.open();
    },
  };
}
