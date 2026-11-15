'use client';
import Link from 'next/link';
import { Fragment, useEffect, useRef } from 'react';
import {
  ACT_LABEL, actPresence, cameraConfig, clamp, damp, dwell, focusWeight, nearFade, noise1d,
  pickTier, smoothstep, TIER_QUALITY, wrapDegrees, type CameraConfig, type MotionTier,
} from './choreography';
import type { IntroAct, IntroChapter, IntroMember } from './chapters';
import { createEclipseGl, parseHex, type EclipseGl } from './gl';
import {
  AboutCard, ActivityCard, EventsCard, FinaleCard, IdentityCard, MemberCard, MemberRoster,
  OverviewTile, OverviewTitle, ScheduleCard, TasksCard,
} from './panels';

const D2R = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pad = (value: number) => String(value).padStart(2, '0');
const RING_SCALE = [1, 1.42, 0.62];

function ChapterCard({ chapter }: { chapter: IntroChapter }) {
  switch (chapter.kind) {
    case 'identity': return <IdentityCard chapter={chapter} />;
    case 'about': return <AboutCard chapter={chapter} />;
    case 'schedule': return <ScheduleCard chapter={chapter} />;
    case 'tasks': return <TasksCard chapter={chapter} />;
    case 'events': return <EventsCard chapter={chapter} />;
    case 'activity': return <ActivityCard chapter={chapter} />;
    case 'finale': return <FinaleCard chapter={chapter} />;
    default: return null;
  }
}

// Seluruh teks dirender sebagai HTML biasa. Atribut data-card hanya penanda untuk
// koreografi; tidak ada atribut style di markup server (CSP style-src tanpa unsafe-inline).
function Scene({ act }: { act: IntroAct }) {
  return (
    <section className="intro-scene" data-scene={act.id} aria-label={ACT_LABEL[act.id]}>
      {act.id === 'orbit' && RING_SCALE.map((_, index) => (
        <span key={index} className="intro-ring" data-ring={index} aria-hidden="true" />
      ))}
      {act.chapters.map((chapter) => {
        if (chapter.kind === 'overview') {
          return (
            <Fragment key={chapter.id}>
              <article className="intro-card intro-card--overview" data-card>
                <OverviewTitle chapter={chapter} />
              </article>
              {chapter.tiles.map((tile, index) => (
                <article key={`${chapter.id}-${tile.key}`} className="intro-card intro-card--tile" data-card>
                  <OverviewTile chapter={chapter} index={index} />
                </article>
              ))}
            </Fragment>
          );
        }
        if (chapter.kind === 'members') {
          return chapter.items.slice(0, chapter.shown).map((member, index) => (
            <article key={member.username} className="intro-card intro-card--member" data-card aria-hidden="true">
              <MemberCard member={member} index={index} total={chapter.shown} />
            </article>
          ));
        }
        return (
          <article key={chapter.id} className={`intro-card intro-card--${chapter.kind}`} data-card>
            <ChapterCard chapter={chapter} />
          </article>
        );
      })}
    </section>
  );
}

type SceneRefs = { root: HTMLElement; nodes: HTMLElement[]; rings: HTMLElement[] };

export function IntroExperience({ acts, total, roster, brand, guest }: {
  acts: IntroAct[];
  total: number;
  roster: IntroMember[];
  brand: string;
  guest: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const hudRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const canvas = canvasRef.current;
    if (!root || !track || !canvas || acts.length === 0) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      root.dataset.motion = 'static';
      return;
    }

    const phoneQuery = window.matchMedia('(max-width: 767px)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const support = (() => {
      try {
        const probe = document.createElement('canvas');
        const context = probe.getContext('webgl');
        context?.getExtension('WEBGL_lose_context')?.loseContext();
        return !!context;
      } catch {
        return false;
      }
    })();
    let tier: MotionTier = pickTier({
      reducedMotion: false, webgl: support, saveData: connection?.saveData === true, phone: phoneQuery.matches,
    });
    let camera: CameraConfig = cameraConfig(phoneQuery.matches);
    root.dataset.motion = 'on';
    root.dataset.tier = tier;
    root.style.setProperty('--intro-persp', `${camera.perspective}px`);
    track.style.height = `${total + 100}vh`;

    const scenes = new Map<string, SceneRefs>();
    root.querySelectorAll<HTMLElement>('[data-scene]').forEach((element) => {
      const id = element.dataset.scene;
      if (!id) return;
      scenes.set(id, {
        root: element,
        nodes: [...element.querySelectorAll<HTMLElement>('[data-card]')],
        rings: [...element.querySelectorAll<HTMLElement>('[data-ring]')],
      });
    });
    for (const scene of scenes.values()) {
      scene.root.style.visibility = 'hidden';
      for (const node of scene.nodes) {
        node.style.visibility = 'hidden';
        node.style.opacity = '0';
      }
    }

    const css = getComputedStyle(root);
    const colors = {
      corona: parseHex(css.getPropertyValue('--intro-corona'), 'E2B36B'),
      background: parseHex(css.getPropertyValue('--intro-bg'), '07090E'),
      cool: parseHex(css.getPropertyValue('--intro-cool'), '7C9AB3'),
    };

    let gl: EclipseGl | null = null;
    const applyTier = (next: MotionTier) => {
      if (next === 'static') return;
      tier = next;
      root.dataset.tier = next;
      if (next === 'css') {
        root.dataset.gl = 'off';
        gl?.dispose();
        gl = null;
        return;
      }
      root.dataset.gl = 'on';
      const quality = TIER_QUALITY[next];
      if (!gl) {
        gl = createEclipseGl(canvas, {
          particles: quality.particles,
          onLost: () => { if (tier !== 'css') applyTier('css'); },
        });
        if (!gl) { applyTier('css'); return; }
      }
      gl.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, quality.dpr));
      gl.setParticles(quality.particles);
    };
    applyTier(tier);

    const put = (node: HTMLElement, x: number, y: number, z: number, rx: number, ry: number, rz: number, opacity: number) => {
      if (opacity < 0.01) {
        node.style.visibility = 'hidden';
        node.style.opacity = '0';
        return;
      }
      node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) `
        + `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) translate(-50%,-50%)`;
      node.style.opacity = opacity.toFixed(3);
      node.style.visibility = 'visible';
    };

    const updateGate = (scene: SceneRefs, presence: ReturnType<typeof actPresence>) => {
      const nodes = scene.nodes;
      const n = nodes.length;
      const camZ = -presence.u * (n - 1) * camera.spacing;
      const camX = Math.sin(presence.u * Math.PI * 2) * 60 * camera.amplitude;
      const pitch = Math.sin(presence.u * Math.PI * 2) * 3 * camera.amplitude;
      const roll = Math.cos(presence.u * Math.PI) * 1.5 * camera.amplitude;
      const yaw = Math.sin(presence.u * Math.PI * 2 + 0.6) * 4 * camera.amplitude;
      scene.root.style.transform = `rotateX(${(-pitch).toFixed(3)}deg) rotateZ(${(-roll).toFixed(3)}deg) `
        + `rotateY(${(-yaw).toFixed(3)}deg) translate3d(${(-camX).toFixed(1)}px,0px,${(-camZ + presence.warp).toFixed(1)}px)`;
      nodes.forEach((node, index) => {
        const z = -index * camera.spacing;
        const relative = z - camZ;
        const opacity = clamp(1 - relative / (0.5 * camera.perspective))
          * clamp((-relative + 3.2 * camera.depth) / (2.2 * camera.depth)) * presence.opacity;
        const side = index === 0 ? 0 : (index % 2 ? 1 : -1);
        put(node, side * camera.side, Math.sin(index * 1.7) * 40, z, 0, -side * camera.yaw, 0, opacity);
      });
    };

    const updateOverview = (scene: SceneRefs, presence: ReturnType<typeof actPresence>) => {
      const [title, ...tiles] = scene.nodes;
      const phone = camera.phone;
      const width = phone ? 150 : 220;
      const height = phone ? 112 : 150;
      const gap = 16;
      const originY = 40;
      scene.root.style.transform = `rotateY(${(Math.sin(presence.u * Math.PI) * 7).toFixed(2)}deg) `
        + `translate3d(0px,0px,${presence.warp.toFixed(1)}px)`;
      const assemble = smoothstep(0, 0.32, presence.u);
      const leave = smoothstep(0.74, 1, presence.u);
      const titleZ = lerp(-900, 0, assemble) + leave * 500;
      if (title) {
        put(title, 0, originY - (height + gap / 2) - (phone ? 96 : 104), titleZ,
          (1 - assemble) * 40, 0, 0, assemble * (1 - leave) * nearFade(titleZ + presence.warp, camera.perspective) * presence.opacity);
      }
      tiles.forEach((node, index) => {
        const enter = smoothstep(0.04 + 0.05 * index, 0.5 + 0.03 * index, presence.u);
        const exit = smoothstep(0.72 + 0.03 * index, 1, presence.u);
        const rest = 1 - enter;
        const gridX = ((index % 2) - 0.5) * (width + gap);
        const gridY = (Math.floor(index / 2) - 0.5) * (height + gap) + originY;
        const startX = (noise1d(index, 1) - 0.5) * 1800 * (phone ? 0.5 : 1);
        const startY = (noise1d(index, 2) - 0.5) * 1000;
        const startZ = -300 - noise1d(index, 3) * 1400;
        const startRx = (noise1d(index, 4) - 0.5) * 150;
        const startRy = (noise1d(index, 5) - 0.5) * 150;
        const startRz = (noise1d(index, 6) - 0.5) * 120;
        const z = lerp(startZ, 0, enter) + exit * 0.55 * camera.perspective;
        const opacity = smoothstep(0, 0.25, enter) * (1 - smoothstep(0.55, 0.92, exit))
          * nearFade(z + presence.warp, camera.perspective) * presence.opacity;
        put(node, lerp(startX, gridX, enter) + gridX * 2.2 * exit, lerp(startY, gridY, enter) + gridY * 1.8 * exit,
          z, startRx * rest - exit * 40, startRy * rest + exit * 60, startRz * rest, opacity);
      });
    };

    const updateOrbit = (scene: SceneRefs, presence: ReturnType<typeof actPresence>, focus: number) => {
      const n = Math.max(1, scene.nodes.length);
      const step = 360 / n;
      const radius = camera.phone ? 300 : 560;
      const bias = camera.phone ? 0 : -30;
      scene.root.style.transform = `rotateX(${(-(11 + 4 * Math.sin(presence.u * Math.PI * 2))).toFixed(2)}deg) `
        + `translate3d(0px,0px,${presence.warp.toFixed(1)}px)`;
      scene.rings.forEach((ring, index) => {
        const scale = RING_SCALE[index] ?? 1;
        const ringRadius = radius * scale;
        if (ring.dataset.radius !== String(ringRadius)) {
          ring.dataset.radius = String(ringRadius);
          ring.style.width = `${2 * ringRadius}px`;
          ring.style.height = `${2 * ringRadius}px`;
          ring.style.transform = `translate3d(0px,0px,${-radius}px) rotateX(90deg) translate(-50%,-50%)`;
        }
        ring.style.opacity = ((scale === 1 ? 0.5 : 0.2) * presence.opacity).toFixed(3);
        ring.style.visibility = presence.opacity > 0.01 ? 'visible' : 'hidden';
      });
      scene.nodes.forEach((node, index) => {
        const phi = (index - focus) * step + bias;
        const radians = phi * D2R;
        const facing = Math.cos(radians);
        put(node, radius * Math.sin(radians), 34 * Math.sin(index * 1.9 + focus * 0.9),
          -radius + radius * facing, 0, wrapDegrees(phi) * 0.55, 0, smoothstep(-0.2, 0.55, facing) * presence.opacity);
      });
    };

    const updateComet = (scene: SceneRefs, presence: ReturnType<typeof actPresence>, focus: number) => {
      const n = Math.max(1, scene.nodes.length);
      const radius = camera.phone ? 250 : 360;
      const angle = camera.phone ? 58 : 62;
      const gapY = camera.phone ? 118 : 150;
      scene.root.style.transform = `rotateX(7deg) rotateZ(${(Math.sin(focus * 0.6) * 1.8).toFixed(2)}deg) `
        + `translate3d(0px,0px,${presence.warp.toFixed(1)}px)`;
      scene.nodes.forEach((node, index) => {
        const delta = index - focus;
        const radians = delta * angle * D2R;
        const facing = Math.cos(radians);
        const zig = index % 2 ? 1 : -1;
        const opacity = focusWeight(index, focus) * smoothstep(-0.35, 0.4, facing) * presence.opacity;
        put(node, radius * Math.sin(radians) + zig * 14, delta * gapY + zig * 16,
          -radius + radius * facing, 0, wrapDegrees(delta * angle) * 0.6, zig * 2.5, opacity);
      });
    };

    const updateFinale = (scene: SceneRefs, presence: ReturnType<typeof actPresence>) => {
      scene.root.style.transform = `translate3d(0px,0px,${presence.warp.toFixed(1)}px)`;
      const node = scene.nodes[0];
      if (!node) return;
      const enter = smoothstep(0, 0.55, presence.u);
      put(node, 0, (1 - enter) * 130, -(1 - enter) * 650, (1 - enter) * 22, 0, 0,
        smoothstep(0, 0.3, presence.u) * presence.opacity);
    };

    let orbitBars: HTMLElement[] = [];
    const orbitAct = acts.find((act) => act.id === 'orbit');
    if (orbitAct) {
      const orbitScene = scenes.get('orbit');
      const activityIndex = orbitAct.chapters.findIndex((chapter) => chapter.kind === 'activity');
      if (orbitScene && activityIndex >= 0) {
        orbitBars = [...(orbitScene.nodes[activityIndex]?.querySelectorAll<HTMLElement>('[data-bar]') ?? [])];
      }
    }

    let trackHeight = 0;
    let target = 0;
    let current = 0;
    let raf = 0;
    let running = false;
    let last = 0;
    let inView = true;
    let perfStart = 0;
    let perfFrames = 0;

    const measure = () => { trackHeight = track.offsetHeight; };
    const readScroll = () => {
      const maximum = trackHeight - window.innerHeight;
      target = maximum > 0 ? clamp(-track.getBoundingClientRect().top / maximum) * total : 0;
    };

    const downgrade = () => {
      const order: MotionTier[] = ['full', 'mobile', 'css'];
      const index = order.indexOf(tier);
      if (index >= 0 && index < order.length - 1) applyTier(order[index + 1]!);
    };

    const update = (t: number, time: number) => {
      let spin = 0;
      let fall = 0;
      let cameraZ = 0;
      let bloom = 0;
      let comet: [number, number, number, number] | null = null;
      let bestId: IntroAct['id'] = acts[0]?.id ?? 'gate';
      let bestOpacity = -1;
      let bestFocus = 1;
      let bestTotal = 1;

      for (const act of acts) {
        const presence = actPresence(act, t);
        const scene = scenes.get(act.id);
        if (!scene) continue;
        const count = Math.max(1, scene.nodes.length);
        let focus = 1;
        let focusTotal = count;
        let orbitFocus = 0;
        let cometFocus = 0;
        if (act.id === 'orbit') {
          orbitFocus = dwell(presence.u * (count - 1), 0.25);
          focus = Math.round(orbitFocus) + 1;
        } else if (act.id === 'comet') {
          cometFocus = dwell(presence.u * (count - 1), 0.22);
          focus = Math.round(cometFocus) + 1;
        } else if (act.id === 'gate') {
          focus = Math.round(presence.u * (count - 1)) + 1;
        }

        if (presence.opacity > bestOpacity) {
          bestOpacity = presence.opacity;
          bestId = act.id;
          bestFocus = focus;
          bestTotal = focusTotal;
        }

        if (presence.opacity <= 0.01) {
          // visibility:hidden pada induk masih bisa ditimpa visibility:visible di kartu.
          // display:none memastikan kartu adegan yang tidak aktif tidak ikut dirender.
          scene.root.style.display = 'none';
          scene.root.style.visibility = 'hidden';
        } else {
          scene.root.style.display = '';
          scene.root.style.visibility = 'visible';
          if (act.id === 'gate') updateGate(scene, presence);
          else if (act.id === 'overview') updateOverview(scene, presence);
          else if (act.id === 'orbit') {
            updateOrbit(scene, presence, orbitFocus);
            const width = focusWeight(Math.round(orbitFocus), orbitFocus, 0.5);
            orbitBars.forEach((bar, index) => { bar.style.transform = `scaleY(${clamp(width * 1.4 - index * 0.12).toFixed(3)})`; });
          } else if (act.id === 'comet') updateComet(scene, presence, cometFocus);
          else updateFinale(scene, presence);
        }

        if (act.id === 'gate') cameraZ += presence.u * 0.9;
        else if (act.id === 'overview') cameraZ += presence.u * 0.3;
        else if (act.id === 'orbit') {
          cameraZ += presence.u * 0.15;
          spin += orbitFocus * (360 / count) * D2R;
        } else if (act.id === 'comet') {
          cameraZ += presence.u * 0.2;
          spin += cometFocus * 58 * D2R * 0.35;
          fall += cometFocus * 0.11;
          if (presence.opacity > 0.001) comet = [Math.sin(cometFocus * 0.9) * 0.025, -0.1, presence.opacity, 0.95];
        } else {
          cameraZ += presence.u * 0.9;
          bloom = Math.max(bloom, smoothstep(0.1, 0.8, presence.u) * presence.opacity);
        }
      }

      const finale = acts.find((act) => act.id === 'finale');
      if (finale) {
        const totality = finale.start + 0.45 * finale.weight;
        const progress = 0.5 * clamp(t / Math.max(1, totality)) + 0.06 * smoothstep(totality, finale.end, t);
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
        gl?.draw({
          time, progress, cameraZ, spin, fall, bloom, comet,
          stars: TIER_QUALITY[tier].stars,
          corona: colors.corona, background: colors.background, cool: colors.cool,
        });
      }

      if (hudRef.current) {
        const text = `${ACT_LABEL[bestId]} ${pad(bestFocus)} / ${pad(bestTotal)}`;
        if (hudRef.current.textContent !== text) hudRef.current.textContent = text;
      }
    };

    function frame(now: number) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      current += (target - current) * damp(dt, 7.5);
      if (Math.abs(target - current) < 0.01) current = target;
      update(current, now / 1000);

      // Rata-rata 3 detik di atas 22,2 ms (di bawah 45 FPS) menurunkan satu tier.
      if (!perfStart) perfStart = now;
      perfFrames += 1;
      if (now - perfStart >= 3000) {
        const average = (now - perfStart) / perfFrames;
        perfStart = now;
        perfFrames = 0;
        if (average > 22.22) downgrade();
      }
      if (running) raf = requestAnimationFrame(frame);
    }

    const start = () => {
      if (running || document.hidden || !inView) return;
      running = true;
      last = 0;
      perfStart = 0;
      perfFrames = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onResize = () => {
      camera = cameraConfig(phoneQuery.matches);
      root.style.setProperty('--intro-persp', `${camera.perspective}px`);
      measure();
      readScroll();
      if (tier !== 'css' && gl) {
        gl.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, TIER_QUALITY[tier].dpr));
        gl.setParticles(TIER_QUALITY[tier].particles);
      }
    };

    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        if (inView) start();
        else stop();
      }, { rootMargin: '240px 0px' })
      : null;
    observer?.observe(track);
    const onVisibility = () => { if (document.hidden) stop(); else start(); };
    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    measure();
    readScroll();
    current = target;
    start();

    return () => {
      stop();
      observer?.disconnect();
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      gl?.dispose();
      gl = null;
      for (const scene of scenes.values()) {
        scene.root.style.removeProperty('display');
        scene.root.style.removeProperty('visibility');
        scene.root.style.removeProperty('transform');
        for (const node of scene.nodes) {
          node.style.removeProperty('visibility');
          node.style.removeProperty('opacity');
          node.style.removeProperty('transform');
        }
      }
      root.removeAttribute('data-motion');
      root.removeAttribute('data-tier');
      root.removeAttribute('data-gl');
      root.style.removeProperty('--intro-persp');
      track.style.removeProperty('height');
    };
  }, [acts, total]);

  return (
    <div className="intro" ref={rootRef}>
      <canvas ref={canvasRef} className="intro-canvas" aria-hidden="true" />
      <header className="intro-bar">
        <span className="intro-bar__brand">{brand}</span>
        <nav aria-label="Navigasi intro">
          <Link href="/beranda">Beranda klasik</Link>
          {guest && <Link href="/login?next=%2F">Masuk</Link>}
        </nav>
      </header>
      <div className="intro-progress" aria-hidden="true"><span ref={progressRef} /></div>
      <main id="main">
        <div className="intro-track" ref={trackRef}>
          <div className="intro-stage">
            <div className="intro-world">
              {acts.map((act) => <Scene key={act.id} act={act} />)}
            </div>
          </div>
        </div>
      </main>
      {roster.length > 0 && <MemberRoster members={roster} />}
      <div className="intro-hud" aria-hidden="true"><span ref={hudRef} /></div>
    </div>
  );
}
