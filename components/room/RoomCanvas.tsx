'use client';

/**
 * React Three Fiber owns the canvas, the context and resizing; the engine
 * owns everything in it. As in the gallery, frames come from GSAP's ticker
 * (`frameloop="never"` + `advance`), so the choreography and the picture
 * share one requestAnimationFrame — and the engine decides per frame whether
 * there is anything new to draw at all.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { createEngine, type Engine } from './engine/engine';
import type { RoomTier } from './tiers';

interface Props {
  tier: RoomTier;
  dpr: number;
  reduced: boolean;
  /** play the opening flight */
  intro: boolean;
  onEngine: (engine: Engine | null) => void;
  className?: string;
}

function Driver({ tier, reduced, intro, onEngine }: Omit<Props, 'dpr' | 'className'>) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  const setDpr = useThree((s) => s.setDpr);
  const engine = useRef<Engine | null>(null);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;
  // read once, when the engine is made: the intro plays for the first engine only
  const introRef = useRef(intro);

  useEffect(() => {
    const e = createEngine({ renderer: gl, scene, camera: camera as THREE.PerspectiveCamera, tier, reduced, intro: introRef.current, setDpr });
    engine.current = e;
    onEngineRef.current(e);
    return () => {
      engine.current = null;
      onEngineRef.current(null);
      e.dispose();
    };
  }, [gl, scene, camera, tier, reduced, setDpr]);

  useEffect(() => {
    const tick = (time: number) => advance(time);
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [advance]);

  useFrame((state, delta) => {
    engine.current?.frame(Math.min(Math.max(delta, 0), 0.1), state.size.width, state.size.height, state.viewport.dpr);
  }, 1);

  return null;
}

export default function RoomCanvas({ tier, dpr, reduced, intro, onEngine, className }: Props) {
  // R3F measures its parent: mount once it exists
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className={className}>
      {mounted && (
        <Canvas
          flat
          frameloop="never"
          dpr={dpr}
          gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
          camera={{ fov: 34, near: 0.03, far: 90, position: [9, 8, 12] }}
          resize={{ debounce: 0 }}
        >
          <Driver tier={tier} reduced={reduced} intro={intro} onEngine={onEngine} />
        </Canvas>
      )}
    </div>
  );
}
