import Phaser from 'phaser';
import type { EntitySpec, GameSpec, SpawnSpec } from '../spec/schema';
import { SoundFx, collisionSound } from './audio';
import type { GameStatus } from './status';
import { CONTAINED, bounceOffWalls, isFarOutside, isInside, newMover, placeSpawn, steer, type MoverState } from './motion';
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

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;

const HIT_COOLDOWN_MS = 800;
const INVULNERABLE_MS = 1200;

/** Runs any validated GameSpec. All game rules come from the spec; nothing here is game-specific. */
export class GameScene extends Phaser.Scene {
  private player!: Body;
  private entities!: Phaser.Physics.Arcade.Group;
  private hud!: Hud;
  private keys?: Keys;
  private readonly state = new WeakMap<Phaser.GameObjects.GameObject, EntityState>();
  private readonly entityById: Map<string, EntitySpec>;

  private phase: Phase = 'intro';
  private won = false;
  private lastStatusKey = '';
  private score = 0;
  private scoreCarry = 0;
  private lives = 0;
  private elapsedMs = 0;
  private invulnerableUntil = 0;

  constructor(
    private readonly spec: GameSpec,
    private readonly canvases: Map<string, HTMLCanvasElement>,
    private readonly sfx: SoundFx = new SoundFx(),
    /** Real pixels per logical pixel; the camera zooms by this so the 960x540 world fills a sharper canvas. */
    private readonly zoom = 1,
    /** Told whenever the phase, score or lives change (the dashboard shows it as live badges). */
    private readonly onStatus: (status: GameStatus) => void = () => {},
  ) {
    super('game');
    this.entityById = new Map(spec.entities.map((e) => [e.id, e]));
  }

  create(): void {
    const { spec } = this;
    this.phase = 'intro';
    this.won = false;
    this.score = 0;
    this.scoreCarry = 0;
    this.lives = spec.player.lives;
    this.elapsedMs = 0;
    this.invulnerableUntil = 0;

    registerTextures(this, this.canvases);
    this.cameras.main.setBackgroundColor(spec.theme.background).setZoom(this.zoom).centerOn(WORLD.width / 2, WORLD.height / 2);
    // The player and walls live in the field below the HUD bar, so the HUD never covers gameplay.
    this.physics.world.setBounds(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    const start = { x: FIELD.x + spec.player.start.x * FIELD.w, y: FIELD.y + spec.player.start.y * FIELD.h };
    this.player = this.physics.add.image(start.x, start.y, texKey(spec.player.sprite));
    sizeSprite(this.player, spec.sprites[spec.player.sprite]);
    this.player.setCollideWorldBounds(true).setDepth(10);

    this.entities = this.physics.add.group();
    this.physics.add.overlap(this.player, this.entities, (_p, e) => this.onTouch(e as Body));

    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Keys | undefined;
    this.hud = new Hud(this, spec.theme, spec.score.label);
    this.refreshHud();
    this.input.keyboard?.on('keydown-M', () => {
      this.sfx.unlock();
      toast(this, this.sfx.toggleMute() ? 'Sound off' : 'Sound on', spec.theme);
    });

    this.physics.pause();
    showOverlay(
      this,
      spec.theme,
      { eyebrow: 'Ready to play', title: spec.title, body: spec.messages.intro, cta: 'Click or press Space to start' },
      () => this.startRound(),
    );
  }

  private startRound(): void {
    this.phase = 'playing';
    this.reportStatus();
    this.physics.resume();
    this.sfx.unlock();
    this.sfx.play('start');
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
    const { pos, dir } = placeSpawn(rule.edge, { w: def.width, h: def.height }, FIELD, this.player);
    if (spec.behavior === 'static') {
      // Static entities must sit inside the field to be reachable.
      pos.x = Phaser.Math.Clamp(pos.x, FIELD.x + def.width, FIELD.x + FIELD.w - def.width);
      pos.y = Phaser.Math.Clamp(pos.y, FIELD.y + def.height, FIELD.y + FIELD.h - def.height);
    }

    const sprite = this.entities.create(pos.x, pos.y, texKey(spec.sprite)) as Body;
    sizeSprite(sprite, def);
    this.state.set(sprite, { spec, mover: newMover(dir, spec.behavior), entered: false, cooldownUntil: 0 });
  }

  update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;
    this.elapsedMs += delta;
    this.movePlayer();
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
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (k) {
      dx = Number(k.RIGHT.isDown || k.D.isDown) - Number(k.LEFT.isDown || k.A.isDown);
      dy = Number(k.DOWN.isDown || k.S.isDown) - Number(k.UP.isDown || k.W.isDown);
    }
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

  private moveEntity(sprite: Body, delta: number): void {
    const s = this.state.get(sprite);
    if (!s) return;
    const half = { w: sprite.displayWidth / 2, h: sprite.displayHeight / 2 };

    let vel = steer(s.spec.behavior, s.mover, sprite, this.player, s.spec.speed, delta);
    if (!s.entered && isInside(sprite, half, FIELD)) s.entered = true;
    if (s.entered && !s.mover.leaving && CONTAINED.has(s.spec.behavior)) {
      vel = bounceOffWalls(s.mover, vel, sprite, half, FIELD);
    }
    sprite.setVelocity(vel.x, vel.y);
    this.face(sprite, s.spec.sprite, vel.x);

    if (isFarOutside(sprite, half, FIELD) && (s.entered || s.mover.ageMs > 4000)) sprite.destroy();
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
    this.phase = 'over';
    this.won = won;
    this.reportStatus();
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
        stat: { value: String(this.score), label: spec.score.label },
        cta: 'Click or press Space to play again',
        tone: won ? 'win' : 'lose',
      },
      () => this.scene.restart(),
    );
  }

  /** Report phase/score/lives to the embedder, only when something changed. */
  private reportStatus(): void {
    const { spec } = this;
    const status: GameStatus = {
      phase: this.phase === 'over' ? (this.won ? 'won' : 'lost') : this.phase,
      score: this.score,
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
