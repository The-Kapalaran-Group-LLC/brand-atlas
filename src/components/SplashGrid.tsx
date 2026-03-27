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
      const radius = 4; // Roundness radius
      
      // Isometric projection
      // Center the grid on the screen
      const screenX = canvas.width / 2 + (x - y) * tileW / 2;
      const screenY = canvas.height / 2 + (x + y) * tileH / 2 - z;

      // Colors based on position to match the app's indigo/cyan/fuchsia gradient
      // x goes from -gridSize to gridSize
      const xRatio = (x + gridSize) / (gridSize * 2);
      const yRatio = (y + gridSize) / (gridSize * 2);
      
      // Interpolate between indigo (230), cyan (190), fuchsia (290)
      const hue = 230 - (xRatio * 40) + (yRatio * 60);
      
      const normalizedZ = Math.max(0, Math.min(1, z / 60));
      
      // Top face (lightest) - with rounded corners
      ctx.fillStyle = `hsla(${hue}, 80%, ${90 + normalizedZ * 10}%, 0.9)`;
      ctx.beginPath();
      const p1 = { x: screenX, y: screenY };
      const p2 = { x: screenX + tileW / 2, y: screenY + tileH / 2 };
      const p3 = { x: screenX, y: screenY + tileH };
      const p4 = { x: screenX - tileW / 2, y: screenY + tileH / 2 };
      
      // Start from top and curve to right
      ctx.moveTo(p1.x + (p2.x - p1.x) * 0.3, p1.y + (p2.y - p1.y) * 0.3);
      ctx.quadraticCurveTo(p2.x - radius, p2.y - radius, p2.x - (p2.x - p3.x) * 0.3, p2.y + (p3.y - p2.y) * 0.3);
      ctx.quadraticCurveTo(p3.x + radius, p3.y + radius, p3.x - (p3.x - p4.x) * 0.3, p3.y + (p4.y - p3.y) * 0.3);
      ctx.quadraticCurveTo(p4.x - radius, p4.y - radius, p4.x + (p1.x - p4.x) * 0.3, p4.y + (p1.y - p4.y) * 0.3);
      ctx.quadraticCurveTo(p1.x - radius, p1.y - radius, p1.x + (p2.x - p1.x) * 0.3, p1.y + (p2.y - p1.y) * 0.3);
      ctx.fill();
      
      // Add a subtle stroke to define the edges
      ctx.strokeStyle = `hsla(${hue}, 80%, 100%, 0.6)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Right face (medium)
      ctx.fillStyle = `hsla(${hue}, 70%, ${75 + normalizedZ * 10}%, 0.85)`;
      ctx.beginPath();
      const rp1 = { x: screenX, y: screenY + tileH };
      const rp2 = { x: screenX + tileW / 2, y: screenY + tileH / 2 };
      const rp3 = { x: screenX + tileW / 2, y: screenY + tileH / 2 + 200 };
      const rp4 = { x: screenX, y: screenY + tileH + 200 };
      
      ctx.moveTo(rp1.x, rp1.y + (rp2.y - rp1.y) * 0.3);
      ctx.quadraticCurveTo(rp2.x + radius, rp2.y, rp2.x + (rp3.x - rp2.x) * 0.3, rp2.y + (rp3.y - rp2.y) * 0.3);
      ctx.quadraticCurveTo(rp3.x + radius, rp3.y, rp4.x + (rp3.x - rp4.x) * 0.3, rp3.y + (rp4.y - rp3.y) * 0.3);
      ctx.quadraticCurveTo(rp4.x - radius, rp4.y, rp1.x, rp1.y + (rp2.y - rp1.y) * 0.3);
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 70%, 85%, 0.3)`;
      ctx.stroke();

      // Left face (darkest)
      ctx.fillStyle = `hsla(${hue}, 60%, ${65 + normalizedZ * 10}%, 0.85)`;
      ctx.beginPath();
      const lp1 = { x: screenX, y: screenY + tileH };
      const lp2 = { x: screenX - tileW / 2, y: screenY + tileH / 2 };
      const lp3 = { x: screenX - tileW / 2, y: screenY + tileH / 2 + 200 };
      const lp4 = { x: screenX, y: screenY + tileH + 200 };
      
      ctx.moveTo(lp1.x, lp1.y + (lp2.y - lp1.y) * 0.3);
      ctx.quadraticCurveTo(lp2.x - radius, lp2.y, lp2.x + (lp3.x - lp2.x) * 0.3, lp2.y + (lp3.y - lp2.y) * 0.3);
      ctx.quadraticCurveTo(lp3.x - radius, lp3.y, lp4.x + (lp3.x - lp4.x) * 0.3, lp3.y + (lp4.y - lp3.y) * 0.3);
      ctx.quadraticCurveTo(lp4.x + radius, lp4.y, lp1.x, lp1.y + (lp2.y - lp1.y) * 0.3);
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 60%, 75%, 0.3)`;
      ctx.stroke();
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const gridSize = 25; // 51x51 grid for higher density
      const size = 14; // Smaller tiles
      
      const pillars = [];
      for (let x = -gridSize; x <= gridSize; x++) {
        for (let y = -gridSize; y <= gridSize; y++) {
          pillars.push({ x, y });
        }
      }
      
      // Sort back-to-front for isometric drawing
      pillars.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      pillars.forEach(({ x, y }) => {
        // Create a wave effect based on distance from center
        const dist = Math.sqrt(x * x + y * y);
        // The wave moves outward over time
        const z = Math.sin(dist * 0.4 - time * 4) * 30 + 30;
        
        drawPillar(x, y, z, size, gridSize);
      });

      time += 0.01;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
