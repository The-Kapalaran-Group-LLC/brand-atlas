import React, { useEffect, useRef } from 'react';

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const drawPillar = (x: number, y: number, z: number, size: number, gridSize: number) => {
      const tileW = size * 2;
      const tileH = size;
      
      // Isometric projection
      // Center the grid on the screen
      const screenX = canvas.width / 2 + (x - y) * tileW / 2;
      const screenY = canvas.height / 2 + (x + y) * tileH / 2 - z;

      // Colors based on position to match the app's indigo/cyan/fuchsia gradient
      const xRatio = (x + gridSize) / (gridSize * 2);
      const yRatio = (y + gridSize) / (gridSize * 2);
      const hue = 230 - (xRatio * 40) + (yRatio * 60);
      
      const normalizedZ = Math.max(0, Math.min(1, z / 60));
      
      // Top face (lightest) - sharp square
      ctx.fillStyle = `hsla(${hue}, 80%, ${90 + normalizedZ * 10}%, 0.9)`;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2);
      ctx.lineTo(screenX, screenY + tileH);
      ctx.lineTo(screenX - tileW / 2, screenY + tileH / 2);
      ctx.closePath();
      ctx.fill();
      
      // Edge highlight
      ctx.strokeStyle = `hsla(${hue}, 80%, 100%, 0.4)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Right face (medium)
      ctx.fillStyle = `hsla(${hue}, 70%, ${75 + normalizedZ * 10}%, 0.85)`;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + tileH);
      ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2);
      ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2 + 200);
      import React, { useEffect, useRef } from 'react';

      type BuildingStyle = 'block' | 'terrace' | 'tower' | 'spire';

      export function SplashGrid() {
        const canvasRef = useRef<HTMLCanvasElement>(null);

        useEffect(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          let animationFrameId: number;
          let time = 0;
          const startTime = performance.now();
          const splashDuration = 3000;

          const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          };

          const isoProject = (
            gridX: number,
            gridY: number,
            z: number,
            tileW: number,
            tileH: number,
            originX: number,
            originY: number
          ) => ({
            x: originX + (gridX - gridY) * tileW * 0.5,
            y: originY + (gridX + gridY) * tileH * 0.5 - z,
          });

          const drawDiamond = (
            centerX: number,
            centerY: number,
            tileW: number,
            tileH: number,
            fillStyle: string | CanvasGradient,
            strokeStyle?: string
          ) => {
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - tileH * 0.5);
            ctx.lineTo(centerX + tileW * 0.5, centerY);
            ctx.lineTo(centerX, centerY + tileH * 0.5);
            ctx.lineTo(centerX - tileW * 0.5, centerY);
            ctx.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill();
            if (strokeStyle) {
              ctx.strokeStyle = strokeStyle;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          };

          const drawRoad = (
            gridX: number,
            gridY: number,
            tileW: number,
            tileH: number,
            originX: number,
            originY: number,
            hue: number,
            alpha: number,
            seed: number
          ) => {
            const center = isoProject(gridX, gridY, 0, tileW, tileH, originX, originY);
            const gradient = ctx.createLinearGradient(center.x, center.y - tileH * 0.5, center.x, center.y + tileH * 0.5);
            gradient.addColorStop(0, `hsla(${hue}, 22%, 84%, ${alpha})`);
            gradient.addColorStop(1, `hsla(${hue}, 16%, 70%, ${alpha})`);
            drawDiamond(center.x, center.y, tileW, tileH, gradient, `hsla(${hue}, 24%, 98%, ${alpha * 0.2})`);

            ctx.strokeStyle = `hsla(${hue + 8}, 92%, 96%, ${alpha * 0.24})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(center.x - tileW * 0.18, center.y - tileH * 0.18);
            ctx.lineTo(center.x + tileW * 0.18, center.y + tileH * 0.18);
            ctx.moveTo(center.x + tileW * 0.18, center.y - tileH * 0.18);
            ctx.lineTo(center.x - tileW * 0.18, center.y + tileH * 0.18);
            ctx.stroke();

            const traffic = (Math.sin(time * 2.6 + seed) + 1) * 0.5;
            ctx.fillStyle = `hsla(${hue + 20}, 100%, 92%, ${alpha * 0.72})`;
            ctx.beginPath();
            ctx.arc(
              center.x - tileW * 0.16 + traffic * tileW * 0.32,
              center.y - tileH * 0.16 + traffic * tileH * 0.32,
              1.8,
              0,
              Math.PI * 2
            );
            ctx.fill();

            ctx.fillStyle = `hsla(${hue - 18}, 100%, 76%, ${alpha * 0.62})`;
            ctx.beginPath();
            ctx.arc(
              center.x + tileW * 0.16 - traffic * tileW * 0.32,
              center.y - tileH * 0.16 + traffic * tileH * 0.32,
              1.6,
              0,
              Math.PI * 2
            );
            ctx.fill();
          };

          const drawBuilding = (
            gridX: number,
            gridY: number,
            height: number,
            tileW: number,
            tileH: number,
            originX: number,
            originY: number,
            hue: number,
            alpha: number,
            phase: number,
            style: BuildingStyle
          ) => {
            const base = isoProject(gridX, gridY, 0, tileW, tileH, originX, originY);
            const top = isoProject(gridX, gridY, height, tileW, tileH, originX, originY);
            const pulse = (Math.sin(time * 2.1 + phase) + 1) * 0.5;

            ctx.beginPath();
            ctx.moveTo(base.x, base.y + tileH * 0.5);
            ctx.lineTo(base.x + tileW * 0.5, base.y);
            ctx.lineTo(top.x + tileW * 0.5, top.y);
            ctx.lineTo(top.x, top.y + tileH * 0.5);
            ctx.closePath();
            ctx.fillStyle = `hsla(${hue}, 54%, 57%, ${alpha * 0.96})`;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(base.x, base.y + tileH * 0.5);
            ctx.lineTo(base.x - tileW * 0.5, base.y);
            ctx.lineTo(top.x - tileW * 0.5, top.y);
            ctx.lineTo(top.x, top.y + tileH * 0.5);
            ctx.closePath();
            ctx.fillStyle = `hsla(${hue}, 42%, 48%, ${alpha * 0.96})`;
            ctx.fill();

            const roofGradient = ctx.createLinearGradient(top.x, top.y - tileH * 0.5, top.x, top.y + tileH * 0.5);
            roofGradient.addColorStop(0, `hsla(${hue}, 88%, 92%, ${alpha})`);
            roofGradient.addColorStop(1, `hsla(${hue}, 72%, 78%, ${alpha})`);
            drawDiamond(top.x, top.y, tileW, tileH, roofGradient, `hsla(${hue}, 96%, 98%, ${alpha * 0.34})`);

            const rows = Math.max(2, Math.floor(height / 18));
            for (let row = 0; row < rows; row++) {
              const rowY = base.y - row * (height / rows) + tileH * 0.16;
              const lit = (row + Math.floor(phase * 10)) % 3 === 0;
              ctx.strokeStyle = lit
                ? `hsla(${hue + 12}, 95%, ${82 + pulse * 10}%, ${alpha * 0.35})`
                : `hsla(${hue}, 32%, 96%, ${alpha * 0.08})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(base.x - tileW * 0.18, rowY - tileH * 0.18);
              ctx.lineTo(base.x + tileW * 0.18, rowY - tileH * 0.34);
              ctx.stroke();
            }

            if (style === 'terrace') {
              const terrace = isoProject(gridX, gridY, height + tileH * 0.8, tileW * 0.64, tileH * 0.64, originX, originY);
              drawDiamond(
                terrace.x,
                terrace.y,
                tileW * 0.64,
                tileH * 0.64,
                `hsla(${hue}, 86%, 90%, ${alpha * 0.86})`,
                `hsla(${hue}, 96%, 98%, ${alpha * 0.28})`
              );
            }

            if (style === 'tower' || style === 'spire') {
              ctx.beginPath();
              ctx.moveTo(top.x, top.y - tileH * 0.14);
              ctx.lineTo(top.x, top.y - 18 - pulse * 8 - (style === 'spire' ? 10 : 0));
              ctx.strokeStyle = `hsla(${hue + 10}, 92%, 94%, ${alpha * 0.56})`;
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
          };

          const render = () => {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / splashDuration, 1);
            const scale = 1.34 - progress * 0.12;
            const collapseStart = 0.72;
            const collapseProgress = progress <= collapseStart
              ? 0
              : (progress - collapseStart) / (1 - collapseStart);
            const collapse = 1 - collapseProgress * collapseProgress * (3 - 2 * collapseProgress);
            const tileW = 48 * scale;
            const tileH = 24 * scale;
            const gridRadiusX = 12;
            const gridRadiusY = 12;
            const originX = window.innerWidth * 0.5;
            const originY = window.innerHeight * (0.18 + collapseProgress * 0.2);

            const atmosphere = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
            atmosphere.addColorStop(0, `rgba(255,255,255,${0.06 * collapse})`);
            atmosphere.addColorStop(1, `rgba(255,255,255,${0.2 * collapse})`);
            ctx.fillStyle = atmosphere;
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

            const cells: Array<{ x: number; y: number; road: boolean; hue: number }> = [];
            for (let y = -gridRadiusY; y <= gridRadiusY; y++) {
              for (let x = -gridRadiusX; x <= gridRadiusX; x++) {
                cells.push({
                  x,
                  y,
                  road: x % 4 === 0 || y % 4 === 0,
                  hue: 226 + ((x + y + 24) % 6) * 6,
                });
              }
            }

            cells.sort((a, b) => (a.x + a.y) - (b.x + b.y));

            cells.forEach((cell, index) => {
              const center = isoProject(cell.x, cell.y, 0, tileW, tileH, originX, originY);
              const dist = Math.hypot(cell.x * 0.9, cell.y * 0.9);
              const cityPulse = Math.sin(time * 1.4 - dist * 0.42 + index * 0.01) * 0.5 + 0.5;
              const alpha = Math.max(0, (0.18 + (1 - Math.min(dist / 16, 1)) * 0.34) * collapse);

              if (cell.road) {
                drawRoad(cell.x, cell.y, tileW, tileH, originX, originY, cell.hue, alpha, index * 0.17);
                return;
              }

              const lotGradient = ctx.createLinearGradient(center.x, center.y - tileH * 0.5, center.x, center.y + tileH * 0.5);
              lotGradient.addColorStop(0, `hsla(${cell.hue}, 26%, 90%, ${alpha * 0.85})`);
              lotGradient.addColorStop(1, `hsla(${cell.hue}, 18%, 82%, ${alpha * 0.85})`);
              drawDiamond(center.x, center.y, tileW, tileH, lotGradient, `hsla(${cell.hue}, 30%, 96%, ${alpha * 0.18})`);

              const coreBoost = 1 - Math.min(Math.hypot(cell.x, cell.y) / 15, 1);
              const baseHeight = (34 + coreBoost * 70 + cityPulse * 26) * scale * collapse;
              const landmark = (cell.x === -1 && cell.y === 1) || (cell.x === 2 && cell.y === -2) || (cell.x === -3 && cell.y === -1);
              const style: BuildingStyle = landmark
                ? (cell.x === 2 ? 'spire' : 'tower')
                : (Math.abs(cell.x + cell.y) % 5 === 0 ? 'terrace' : 'block');
              const height = landmark ? baseHeight * 1.7 : baseHeight;

              drawBuilding(
                cell.x,
                cell.y,
                height,
                tileW * (landmark ? 0.9 : 0.72),
                tileH * (landmark ? 0.9 : 0.72),
                originX,
                originY,
                cell.hue + (landmark ? 8 : 0),
                alpha,
                index * 0.09,
                style
              );
            });

            const avenueGlow = ctx.createLinearGradient(0, originY + tileH * 7, 0, window.innerHeight);
            avenueGlow.addColorStop(0, 'rgba(255,255,255,0)');
            avenueGlow.addColorStop(1, `rgba(255,255,255,${0.16 * collapse})`);
            ctx.fillStyle = avenueGlow;
            ctx.fillRect(0, originY + tileH * 7, window.innerWidth, window.innerHeight - (originY + tileH * 7));

            time += 0.0065;
            animationFrameId = requestAnimationFrame(render);
          };

          window.addEventListener('resize', resize);
          resize();
          render();

          return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
          };
        }, []);

        return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
      }
