import Phaser from 'phaser';
import { levelsOf, type EntitySpec, type GameSpec, type SpawnSpec } from '../spec/schema';
import { SoundFx, collisionSound } from './audio';
import { Controls } from './controls';
import { Music } from './music';
import { keyLabel } from '../spec/controls';
import type { GameStatus } from './status';
import { CONTAINED, bounceOffWalls, isFarOutside, isInside, newMover, placeSpawn, steer, type MoverState } from './motion';
import { Animator } from './animate';
import { atLedge, buildLevel, inWall, liftOutOfWalls, type Level } from './level';
import { registerTextures, sizeSprite, texKey } from './textures';
import { Hud, popScore, quoteBubble, showOverlay, toast, type HudState } from './ui';
import { FIELD, WORLD } from './world';

type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
type Phase = 'intro' | 'playing' | 'over';

interface EntityState {
  spec: EntitySpec;
  mover: MoverState;
  entered: boolean;
  cooldownUntil: number;
}


const HIT_COOLDOWN_MS = 800;
/** Platformer forgiveness: jump this long after running off a ledge, or pressed this long before landing. */
const COYOTE_MS = 100;
const JUMP_BUFFER_MS = 120;
const INVULNERABLE_MS = 1200;

/** Runs any validated GameSpec. All game rules come from the spec; nothing here is game-specific. */
export class GameScene extends Phaser.Scene {
  private player!: Body;
  private entities!: Phaser.Physics.Arcade.Group;
  private hud!: Hud;
  private readonly state = new WeakMap<Phaser.GameObjects.GameObject, EntityState>();
  private readonly entityById: Map<string, EntitySpec>;

  private phase: Phase = 'intro';
  private won = false;
  private lastStatusKey = '';
  private score = 0;
  private scoreCarry = 0;
  private lives = 0;
  private elapsedMs = 0;
  private readonly music: Music;
  private invulnerableUntil = 0;
  private level?: Level;
  /** Which level is being played, and what carries over between levels. */
  private levelIndex = 0;
  private carriedLives?: number;
  private carriedScore = 0;
  private animator!: Animator;
  private groundedAt = -Infinity;
  private jumpPressedAt = -Infinity;
  private jumpWasHeld = true;

  constructor(
    private readonly spec: GameSpec,
    private readonly canvases: Map<string, HTMLCanvasElement>,
    private readonly sfx: SoundFx = new SoundFx(),
    /** Real pixels per logical pixel; the camera zooms by this so the 960x540 world fills a sharper canvas. */
    private readonly zoom = 1,
    /** Told whenever the phase, score or lives change (the dashboard shows it as live badges). */
    private readonly onStatus: (status: GameStatus) => void = () => {},
    /** Keyboard (remappable) and gamepad input, shared across round restarts. */
    private readonly controls: Controls = new Controls(),
  ) {
    super('game');
    this.entityById = new Map(spec.entities.map((e) => [e.id, e]));
    this.music = new Music(() => sfx.output());
    // Registered once (not per round) so restarts don't stack listeners.
    controls.onPress('sound', () => {
      if (!this.sys.isActive()) return;
      this.sfx.unlock();
      toast(this, this.sfx.toggleMute() ? 'Sound off' : 'Sound on', spec.theme);
    });
  }

  /** "Click or press Space to start" with the player's actual key. */
  private cta(verb: string): string {
    return `Click or press ${keyLabel(this.controls.firstKey('start'))} to ${verb}`;
  }

  /** Phaser passes restart data here; a plain restart (play again) starts over from level 1. */
  init(data: { levelIndex?: number; lives?: number; total?: number } = {}): void {
    this.levelIndex = data.levelIndex ?? 0;
    this.carriedLives = data.lives;
    this.carriedScore = data.total ?? 0;
  }

  private get levelCount(): number {
    return Math.max(1, levelsOf(this.spec).length);
  }

  create(): void {
    const { spec } = this;
    this.phase = 'intro';
    this.won = false;
    this.score = 0;
    this.scoreCarry = 0;
    this.lives = this.carriedLives ?? spec.player.lives;
    this.elapsedMs = 0;
    this.invulnerableUntil = 0;
    this.groundedAt = this.jumpPressedAt = -Infinity;
    this.jumpWasHeld = true;

    registerTextures(this, this.canvases);
    this.cameras.main.setBackgroundColor(spec.theme.background).setZoom(this.zoom).centerOn(WORLD.width / 2, WORLD.height / 2);
    // The player and walls live in the field below the HUD bar, so the HUD never covers gameplay.
    this.physics.world.setBounds(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    this.level = buildLevel(this, spec, levelsOf(spec)[this.levelIndex]);
    this.animator = new Animator(this);

    const def = spec.sprites[spec.player.sprite];
    let start = this.level?.start ?? { x: FIELD.x + spec.player.start.x * FIELD.w, y: FIELD.y + spec.player.start.y * FIELD.h };
    if (this.level) start = liftOutOfWalls(this.level, start, def.height / 2);
    this.player = this.physics.add.image(start.x, start.y, texKey(spec.player.sprite));
    sizeSprite(this.player, def);
    this.player.setCollideWorldBounds(true).setDepth(10);
    if (this.platformer) this.player.body.setGravityY(this.gravity);
    this.animator.attach(this.player, spec.player.sprite, def);

    this.entities = this.physics.add.group();
    this.physics.add.overlap(this.player, this.entities, (_p, e) => this.onTouch(e as Body));
    if (this.level) {
      this.physics.add.collider(this.player, this.level.walls);
      this.physics.add.collider(this.entities, this.level.walls);
    }

    this.hud = new Hud(this, spec.theme, spec.score.label);
    this.refreshHud();

    this.physics.pause();
    showOverlay(
      this,
      spec.theme,
      this.levelIndex === 0
        ? { eyebrow: this.levelCount > 1 ? `Level 1 of ${this.levelCount}` : 'Ready to play', title: spec.title, body: spec.messages.intro, cta: this.cta('start') }
        : {
            eyebrow: `Level ${this.levelIndex + 1} of ${this.levelCount}`,
            title: levelsOf(spec)[this.levelIndex]?.name ?? `Level ${this.levelIndex + 1}`,
            body: 'Same goal, new layout. Good luck!',
            stat: { value: String(this.carriedScore), label: `total ${spec.score.label.toLowerCase()}` },
            cta: this.cta('continue'),
          },
      () => this.startRound(),
      this.controls,
    );
  }

  private get platformer(): boolean {
    return this.spec.player.controls === 'platformer';
  }

  private get gravity(): number {
    return this.spec.physics?.gravity ?? 0;
  }

  private startRound(): void {
    this.phase = 'playing';
    this.jumpWasHeld = true; // the Space press that started the round is not a jump
    this.reportStatus();
    this.physics.resume();
    this.sfx.unlock();
    this.sfx.play('start');
    this.music.start(this.spec.audio.music, this.spec.audio.volume);
    this.events.once('shutdown', () => this.music.stop());
    for (const rule of this.spec.spawns) {
      this.time.delayedCall(rule.startDelayMs, () => {
        this.trySpawn(rule);
        this.time.addEvent({ delay: rule.everyMs, loop: true, callback: () => this.trySpawn(rule) });
      });
    }
  }

  private trySpawn(rule: SpawnSpec): void {
    const spec = this.entityById.get(rule.entity);
    if (this.phase !== 'playing' || !spec) return;
    const alive = this.entities.getChildren().filter((c) => this.state.get(c)?.spec.id === spec.id).length;
    if (alive >= rule.maxAlive) return;

    const def = this.spec.sprites[spec.sprite];
    const size = { w: def.width, h: def.height };
    const others = this.entities.getChildren() as Body[];
    const tops = this.level?.tops.filter((t) => !others.some((o) => Math.abs(o.x - t.x) < 30 && Math.abs(o.y - t.y) < 60));
    let { pos, dir } = placeSpawn(rule.edge, size, FIELD, this.player, Math.random, tops?.length ? tops : this.level?.tops);
    if (this.level && rule.edge === 'anywhere') {
      for (let i = 0; i < 8 && inWall(this.level, pos); i++) ({ pos, dir } = placeSpawn(rule.edge, size, FIELD, this.player));
      pos = liftOutOfWalls(this.level, pos, def.height / 2);
    }
    if (spec.behavior === 'static') {
      // Static entities must sit inside the field to be reachable.
      pos.x = Phaser.Math.Clamp(pos.x, FIELD.x + def.width, FIELD.x + FIELD.w - def.width);
      pos.y = Phaser.Math.Clamp(pos.y, FIELD.y + def.height, FIELD.y + FIELD.h - def.height);
    }

    const sprite = this.entities.create(pos.x, pos.y, texKey(spec.sprite)) as Body;
    sizeSprite(sprite, def);
    this.state.set(sprite, { spec, mover: newMover(dir, spec.behavior), entered: false, cooldownUntil: 0 });
    if (this.walker(spec)) sprite.body.setGravityY(this.gravity);
    this.animator.attach(sprite, spec.sprite, def);
  }

  update(_time: number, delta: number): void {
    this.controls.poll(); // gamepad buttons work on the start and end cards too
    this.animator.update(this.time.now);
    if (this.phase !== 'playing') return;
    this.elapsedMs += delta;
    if (this.platformer) this.movePlatformer(delta);
    else this.movePlayer();
    for (const child of [...this.entities.getChildren()]) this.moveEntity(child as Body, delta);

    if (this.spec.score.perSecond > 0) {
      this.scoreCarry += (this.spec.score.perSecond * delta) / 1000;
      const whole = Math.floor(this.scoreCarry);
      this.scoreCarry -= whole;
      this.score += whole;
    }
    this.refreshHud();
    this.checkEnd();
  }

  private movePlayer(): void {
    const { player, spec } = this;
    let { x: dx, y: dy } = this.controls.axis();
    let speed = spec.player.speed;
    const pointer = this.input.activePointer;
    if (dx === 0 && dy === 0 && pointer.isDown) {
      dx = pointer.worldX - player.x;
      dy = pointer.worldY - player.y;
      speed *= Math.min(1, Math.hypot(dx, dy) / 24); // ease in so it doesn't jitter at the target
    }
    if (spec.player.controls === 'horizontal') dy = 0;
    if (spec.player.controls === 'vertical') dx = 0;

    const len = Math.hypot(dx, dy);
    if (len < 0.5) {
      player.setVelocity(0, 0);
      return;
    }
    player.setVelocity((dx / len) * speed, (dy / len) * speed);
    this.face(player, spec.player.sprite, dx);
  }

  /** Run left/right with friction smoothing; jump when on the ground (with coyote time and a jump buffer). */
  private movePlatformer(delta: number): void {
    const { player, spec } = this;
    const body = player.body;
    const physics = spec.physics!;
    const now = this.time.now;
    let dx = this.controls.axis().x;
    let jump = this.controls.jumpHeld();
    const pointer = this.input.activePointer;
    if (dx === 0 && pointer.isDown) {
      const off = pointer.worldX - player.x;
      dx = Math.abs(off) < 10 ? 0 : Math.sign(off) * Math.min(1, Math.abs(off) / 48);
      if (pointer.worldY < player.y - player.displayHeight) jump = true;
    }

    const friction = Math.min(0.95, physics.friction);
    const blend = friction === 0 ? 1 : 1 - friction ** (delta / 16.67);
    const target = dx * spec.player.speed;
    player.setVelocityX(body.velocity.x + (target - body.velocity.x) * blend);

    if (body.blocked.down || body.touching.down) this.groundedAt = now;
    if (jump && !this.jumpWasHeld) this.jumpPressedAt = now;
    if (now - this.jumpPressedAt < JUMP_BUFFER_MS && now - this.groundedAt < COYOTE_MS) {
      player.setVelocityY(-physics.jump);
      this.groundedAt = this.jumpPressedAt = -Infinity;
      this.sfx.play('jump');
    }
    // Letting go early makes a shorter hop.
    if (!jump && body.velocity.y < -physics.jump * 0.45) player.setVelocityY(body.velocity.y * 0.6);
    this.jumpWasHeld = jump;
    this.face(player, spec.player.sprite, dx);
  }

  /** Patrolling entities in a game with gravity walk on platforms instead of floating. */
  private walker(spec: EntitySpec): boolean {
    return spec.behavior === 'patrol' && this.gravity > 0;
  }

  private moveEntity(sprite: Body, delta: number): void {
    const s = this.state.get(sprite);
    if (!s) return;
    const half = { w: sprite.displayWidth / 2, h: sprite.displayHeight / 2 };
    const body = sprite.body;
    const walker = this.walker(s.spec);

    if (!s.entered && isInside(sprite, half, FIELD)) {
      s.entered = true;
      if (walker) sprite.setCollideWorldBounds(true);
    }
    // Turn around at level walls (and, for walkers, at platform edges).
    if (s.entered && !s.mover.leaving) {
      const d = s.mover.dir;
      if ((body.blocked.left && d.x < 0) || (body.blocked.right && d.x > 0)) d.x = -d.x;
      if (!walker && ((body.blocked.up && d.y < 0) || (body.blocked.down && d.y > 0))) d.y = -d.y;
    }
    if (walker && body.blocked.down && atLedge(this.level, sprite.x, body.bottom, body.halfWidth, Math.sign(s.mover.dir.x))) {
      s.mover.dir.x = -s.mover.dir.x;
    }

    let vel = steer(s.spec.behavior, s.mover, sprite, this.player, s.spec.speed, delta);
    if (s.entered && !s.mover.leaving && CONTAINED.has(s.spec.behavior)) {
      vel = bounceOffWalls(s.mover, vel, sprite, half, FIELD);
    }
    if (walker) sprite.setVelocityX(vel.x);
    else sprite.setVelocity(vel.x, vel.y);
    this.face(sprite, s.spec.sprite, vel.x);

    const stuck = !s.entered && s.mover.ageMs > 6000; // e.g. spawned behind a wall at the field edge
    if (stuck || (isFarOutside(sprite, half, FIELD) && (s.entered || s.mover.ageMs > 4000))) sprite.destroy();
  }

  /** Mirror a sprite so it faces its direction of travel. */
  private face(img: Body, spriteId: string, vx: number): void {
    const faces = this.spec.sprites[spriteId].faces;
    if (faces === 'none' || Math.abs(vx) < 1) return;
    img.setFlipX(faces === 'left' ? vx > 0 : vx < 0);
  }

  private onTouch(sprite: Body): void {
    const s = this.state.get(sprite);
    const now = this.time.now;
    if (!s || this.phase !== 'playing' || now < s.cooldownUntil) return;
    const { score, lives, destroy } = s.spec.onCollide;
    if (lives < 0 && now < this.invulnerableUntil) return;
    s.cooldownUntil = now + HIT_COOLDOWN_MS;
    this.sfx.play(collisionSound(s.spec.onCollide));

    const { theme } = this.spec;
    if (score !== 0) {
      this.score = Math.max(0, this.score + score);
      popScore(this, sprite.x, sprite.y - 10, `${score > 0 ? '+' : ''}${score}`, score > 0 ? theme.primary : theme.accent);
    }
    if (lives < 0) {
      this.lives += lives;
      this.invulnerableUntil = now + INVULNERABLE_MS;
      this.cameras.main.shake(160, 0.008);
      this.tweens.add({ targets: this.player, alpha: 0.3, duration: 100, yoyo: true, repeat: 5, onComplete: () => this.player.setAlpha(1) });
    } else if (lives > 0) {
      this.lives = Math.min(9, this.lives + lives);
    }
    if (s.spec.quotes.length > 0) {
      quoteBubble(this, sprite.x, sprite.y - 46, Phaser.Utils.Array.GetRandom(s.spec.quotes), theme);
    }
    if (destroy) sprite.destroy();
    this.refreshHud();
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.phase !== 'playing') return;
    const { win, lose } = this.spec;
    const secs = this.elapsedMs / 1000;
    if (this.lives <= 0) this.endRound(false);
    else if (win.type === 'score' && this.score >= win.target) this.endRound(true);
    else if (win.type === 'survive' && secs >= win.seconds) this.endRound(true);
    else if (lose.timeLimitSeconds !== undefined && secs >= lose.timeLimitSeconds) this.endRound(false);
  }

  private endRound(won: boolean): void {
    if (won && this.levelIndex < this.levelCount - 1) return this.nextLevel();
    this.phase = 'over';
    this.won = won;
    this.reportStatus();
    this.music.stop();
    this.physics.pause();
    this.time.removeAllEvents();
    this.sfx.play(won ? 'win' : 'lose');
    const { spec } = this;
    showOverlay(
      this,
      spec.theme,
      {
        eyebrow: spec.title,
        title: won ? 'You win!' : 'Game over',
        body: won ? spec.messages.win : spec.messages.lose,
        stat: { value: String(this.carriedScore + this.score), label: spec.score.label },
        cta: this.cta('play again'),
        tone: won ? 'win' : 'lose',
      },
      () => this.scene.restart(),
      this.controls,
    );
  }

  /** Level cleared with more to go: celebrate, then restart the scene on the next map, keeping lives and score. */
  private nextLevel(): void {
    this.phase = 'intro'; // between levels: the dashboard shows Ready, not a finished game
    this.reportStatus();
    this.music.stop();
    this.physics.pause();
    this.time.removeAllEvents();
    this.sfx.play('big');
    const next = this.levelIndex + 1;
    const total = this.carriedScore + this.score;
    showOverlay(
      this,
      this.spec.theme,
      {
        eyebrow: `Level ${this.levelIndex + 1} cleared`,
        title: levelsOf(this.spec)[next]?.name ?? `Level ${next + 1}`,
        body: `On to level ${next + 1} of ${this.levelCount}.`,
        stat: { value: String(total), label: `total ${this.spec.score.label.toLowerCase()}` },
        cta: this.cta('continue'),
        tone: 'win',
      },
      () => this.scene.restart({ levelIndex: next, lives: this.lives, total }),
      this.controls,
    );
  }

  /** Report phase/score/lives to the embedder, only when something changed. */
  private reportStatus(): void {
    const { spec } = this;
    const status: GameStatus = {
      phase: this.phase === 'over' ? (this.won ? 'won' : 'lost') : this.phase,
      score: this.phase === 'over' ? this.carriedScore + this.score : this.score, // finished games report the total over all levels
      target: spec.win.type === 'score' ? spec.win.target : undefined,
      lives: Math.max(0, this.lives),
      maxLives: Math.max(spec.player.lives, this.lives),
    };
    const key = `${status.phase}|${status.score}|${status.lives}|${status.maxLives}`;
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.onStatus(status);
  }

  private refreshHud(): void {
    this.reportStatus();
    const { spec } = this;
    const secs = this.elapsedMs / 1000;
    let timer: HudState['timer'];
    if (spec.win.type === 'survive') timer = { label: 'Survive', seconds: spec.win.seconds - secs, urgent: false };
    else if (spec.lose.timeLimitSeconds !== undefined) {
      const left = spec.lose.timeLimitSeconds - secs;
      timer = { label: 'Time', seconds: left, urgent: left <= 10 };
    }
    this.hud.update({
      score: this.score,
      target: spec.win.type === 'score' ? spec.win.target : undefined,
      lives: this.lives,
      maxLives: Math.max(spec.player.lives, this.lives),
      timer,
    });
  }
}
