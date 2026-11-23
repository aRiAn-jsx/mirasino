'use client';

/**
 * React Three Fiber owns the canvas, the context, resize and the frame hook.
 * The frame itself is driven from GSAP's ticker (`frameloop="never"` +
 * `advance`), so DOM choreography and WebGL share a single requestAnimationFrame.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { Tier } from './config';
import type { Live } from './live';
import { createWorld, type World, type WorldApi } from './scene/world';

interface SceneProps {
  live: Live;
  tier: Tier;
  dpr: number;
  onReady: (api: WorldApi) => void;
  className?: string;
}

function Room({ live, tier, onReady }: Omit<SceneProps, 'dpr' | 'className'>) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const advance = useThree((s) => s.advance);
  const setDpr = useThree((s) => s.setDpr);
  const world = useRef<World | null>(null);
  const quality = useRef({ step: 0, dpr: 0 });
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const w = createWorld(gl, scene, live, tier);
    world.current = w;
    let alive = true;
    w.ready.then(() => alive && onReadyRef.current(w.api));
    return () => {
      alive = false;
      world.current = null;
      w.dispose();
    };
  }, [gl, scene, live, tier]);

  useEffect(() => {
    const tick = (time: number) => advance(time);
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [advance]);

  useFrame((state, delta) => {
    const w = world.current;
    if (!w) return;
    const dpr = state.viewport.dpr;
    // only judge performance on frames the browser was actually free to draw
    const representative = delta < 0.2 && !document.hidden;
    const stepDown = () => {
      // step down gently, lens work before resolution; never below ~0.6 of the frame
      const q = quality.current;
      q.step++;
      if (q.step === 1) w.setQuality(Math.min(tier.dofTaps, 8), Math.min(tier.beamSteps, 6));
      else if (q.step === 2) setDpr(Math.max(0.62, dpr * 0.85));
      else if (q.step === 3) w.setQuality(0, Math.min(tier.beamSteps, 5));
      else if (q.step === 4) setDpr(Math.max(0.62, dpr * 0.85));
    };
    w.frame(
      state.camera as THREE.PerspectiveCamera,
      Math.min(Math.max(delta, 0), 0.05),
      state.size.width,
      state.size.height,
      dpr,
      delta,
      representative ? stepDown : undefined,
    );
  }, 1);

  return null;
}

export default function Scene({ live, tier, dpr, onReady, className }: SceneProps) {
  // R3F measures its parent; mount the canvas only once that parent exists
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className={className} aria-hidden="true">
      {mounted && (
        <Canvas
          flat
          frameloop="never"
          dpr={dpr}
          gl={{ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }}
          camera={{ fov: 23, near: 0.5, far: 60, position: [0, 3.5, 6.8] }}
          resize={{ debounce: 0 }}
        >
          <Room live={live} tier={tier} onReady={onReady} />
        </Canvas>
      )}
    </div>
  );
}
