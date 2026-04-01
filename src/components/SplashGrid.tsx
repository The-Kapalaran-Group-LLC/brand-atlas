import { useEffect, useRef } from 'react';

const TILE_W = 44;
const TILE_H = 22;
const CITY_SATURATION_BOOST = 0;
const CITY_LIGHTNESS_SHIFT = 10;

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerXRef = useRef(0.5);
  const pointerYRef = useRef(0.85);
  const pointerActiveRef = useRef(false);
  const pointerInfluenceRef = useRef(0);
  const pointerLiftRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const iso = (x: number, y: number, z: number, tileW: number, tileH: number, originX: number, originY: number) => {
      return {
        x: originX + (x - y) * (tileW * 0.5),
        y: originY + (x + y) * (tileH * 0.5) - z,
      };
    };

    const hash = (x: number, y: number) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener('resize', resize);
    resize();

    const setPointerPosition = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerXRef.current = clamp((clientX - rect.left) / rect.width, 0, 1);
      pointerYRef.current = clamp((clientY - rect.top) / rect.height, 0, 1);
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerActiveRef.current = true;
      setPointerPosition(event.clientX, event.clientY);
      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Mouse should react on hover; touch/pen react while pressed.
      if (event.pointerType === 'mouse') {
        pointerActiveRef.current = true;
      }
      setPointerPosition(event.clientX, event.clientY);
    };

    const handlePointerUpOrCancel = () => {
      pointerActiveRef.current = false;
    };

    const handlePointerLeave = () => {
      pointerActiveRef.current = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUpOrCancel);
    canvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    const render = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const haloA = ctx.createRadialGradient(
        window.innerWidth * 0.24,
        window.innerHeight * 0.48,
        0,
        window.innerWidth * 0.24,
        window.innerHeight * 0.48,
        window.innerWidth * 0.46,
      );
      haloA.addColorStop(0, 'hsla(230, 95%, 72%, 0.12)');
      haloA.addColorStop(1, 'hsla(230, 95%, 72%, 0)');
      ctx.fillStyle = haloA;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      const haloB = ctx.createRadialGradient(
        window.innerWidth * 0.78,
        window.innerHeight * 0.66,
        0,
        window.innerWidth * 0.78,
        window.innerHeight * 0.66,
        window.innerWidth * 0.42,
      );
      haloB.addColorStop(0, 'hsla(320, 92%, 78%, 0.1)');
      haloB.addColorStop(1, 'hsla(320, 92%, 78%, 0)');
      ctx.fillStyle = haloB;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      const tileW = TILE_W;
      const tileH = TILE_H;
      const radiusX = Math.ceil(window.innerWidth / (tileW * 0.62));
      const radiusY = 24;
      const originX = window.innerWidth * 0.5;
      const originY = window.innerHeight * 0.9;
      const meshScale = 0.9;
      const sat = (value: number) => clamp(value + CITY_SATURATION_BOOST, 0, 100);
      const light = (value: number) => clamp(value + CITY_LIGHTNESS_SHIFT, 0, 100);

      const pointerInfluenceTarget = pointerActiveRef.current ? 1 : 0;
      pointerInfluenceRef.current += (pointerInfluenceTarget - pointerInfluenceRef.current) * 0.24;
      const pointerLiftTarget = pointerActiveRef.current
        ? clamp((1 - pointerYRef.current) * 2.2 - 0.2, -0.4, 1.85)
        : 0;
      pointerLiftRef.current += (pointerLiftTarget - pointerLiftRef.current) * 0.22;
      const pointerX = pointerXRef.current * window.innerWidth;
      const pointerY = pointerYRef.current * window.innerHeight;
      const pointerSigmaX = window.innerWidth * 0.14;
      const pointerSigmaY = window.innerHeight * 0.18;

      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(meshScale, meshScale);
      ctx.translate(-originX, -originY);

      const cells: Array<{ x: number; y: number }> = [];
      for (let y = -radiusY; y <= radiusY; y++) {
        for (let x = -radiusX; x <= radiusX; x++) {
          cells.push({ x, y });
        }
      }

      cells.sort((a, b) => a.y - b.y || a.x - b.x);

      const points = new Map<string, { x: number; y: number; depth: number; active: number }>();

      cells.forEach(({ x, y }) => {
        if (Math.abs(y) > radiusY * 0.98) return;

        const base = iso(x, y, 0, tileW, tileH, originX, originY);
        const curvature = Math.max(0, 1 - Math.hypot(x * 0.85, y * 0.95) / (radiusY * 1.15));
        const jitter = (hash(x * 2.9, y * 2.3) - 0.5) * 8;
        const wave = Math.sin(time * 1.8 + x * 0.42 + y * 0.31) * 9;

        const distX = base.x - pointerX;
        const distY = base.y - pointerY;
        const weightX = Math.exp(-(distX * distX) / (2 * pointerSigmaX * pointerSigmaX));
        const weightY = Math.exp(-(distY * distY) / (2 * pointerSigmaY * pointerSigmaY));
        const localWeight = weightX * weightY;
        const pointerLift = pointerLiftRef.current * pointerInfluenceRef.current * localWeight;

        const depth = (curvature * 26 + wave + jitter) * (1 + pointerLift * 1.3);
        const elevated = iso(x, y, depth, tileW, tileH, originX, originY);
        const driftX = Math.sin(time * 0.8 + x * 0.17 + y * 0.21) * 4;
        const driftY = Math.cos(time * 0.75 + x * 0.19 - y * 0.16) * 3;

        points.set(`${x},${y}`, {
          x: elevated.x + driftX,
          y: elevated.y + driftY,
          depth,
          active: localWeight,
        });
      });

      const neighbors = [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ];

      points.forEach((point, key) => {
        const [xStr, yStr] = key.split(',');
        const x = Number(xStr);
        const y = Number(yStr);

        neighbors.forEach(([dx, dy]) => {
          const neighbor = points.get(`${x + dx},${y + dy}`);
          if (!neighbor) return;

          const depthMix = clamp((point.depth + neighbor.depth + 56) / 130, 0, 1);
          const alpha = 0.16 + depthMix * 0.24 + (point.active + neighbor.active) * 0.14;
          const lineGrad = ctx.createLinearGradient(point.x, point.y, neighbor.x, neighbor.y);
          lineGrad.addColorStop(0, `hsla(240, ${sat(58)}%, ${light(58)}%, ${alpha})`);
          lineGrad.addColorStop(1, `hsla(320, ${sat(62)}%, ${light(62)}%, ${alpha * 0.95})`);

          ctx.strokeStyle = lineGrad;
          ctx.lineWidth = 0.96 + depthMix * 1.34;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(neighbor.x, neighbor.y);
          ctx.stroke();
        });
      });

      points.forEach((point) => {
        const depthMix = clamp((point.depth + 45) / 120, 0, 1);
        const nodeRadius = 1.25 + depthMix * 2.1 + point.active * 2.6;
        const nodeColor = `hsla(304, ${sat(68)}%, ${light(80)}%, ${0.42 + depthMix * 0.3})`;

        ctx.beginPath();
        ctx.arc(point.x, point.y, nodeRadius * 2.7, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(264, ${sat(64)}%, ${light(72)}%, ${0.07 + point.active * 0.11})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();
      });

      ctx.restore();

      const meshGlow = ctx.createLinearGradient(0, window.innerHeight * 0.4, 0, window.innerHeight);
      meshGlow.addColorStop(0, 'hsla(240, 70%, 70%, 0.08)');
      meshGlow.addColorStop(1, 'hsla(318, 74%, 68%, 0.22)');
      ctx.fillStyle = meshGlow;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      const fog = ctx.createLinearGradient(0, window.innerHeight * 0.45, 0, window.innerHeight);
      fog.addColorStop(0, 'hsla(0, 0%, 100%, 0)');
      fog.addColorStop(1, 'hsla(0, 0%, 100%, 0.68)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      time += 0.008;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUpOrCancel);
      canvas.removeEventListener('pointercancel', handlePointerUpOrCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />;
}
