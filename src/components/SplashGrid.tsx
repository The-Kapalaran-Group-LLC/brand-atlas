import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  opacity: number;
  life: number;
}

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Create initial particles
    const createParticle = () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      const size = Math.random() * 40 + 10;
      const hues = [230, 190, 290, 40, 60]; // Indigo, cyan, fuchsia, orange, red
      
      return {
        x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3,
        y: canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: size,
        hue: hues[Math.floor(Math.random() * hues.length)],
        opacity: Math.random() * 0.6 + 0.3,
        life: 1
      };
    };

    // Initialize particle pool
    for (let i = 0; i < 60; i++) {
      particles.push(createParticle());
    }

    const render = () => {
      // Clear with semi-transparent background for motion blur effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Add some wave motion
        p.vx += Math.sin(time * 0.02 + p.y * 0.01) * 0.1;
        p.vy += Math.cos(time * 0.02 + p.x * 0.01) * 0.1;

        // Damping
        p.vx *= 0.98;
        p.vy *= 0.98;

        // Fade out
        p.life -= 0.005;
        p.opacity *= 0.995;

        // Wrap around or regenerate
        if (p.life < 0 || p.x < -100 || p.x > canvas.width + 100 || p.y < -100 || p.y > canvas.height + 100) {
          particles[i] = createParticle();
          continue;
        }

        // Draw glowing particle
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        const alpha = Math.max(0, p.life * p.opacity);
        
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${alpha * 0.8})`);
        gradient.addColorStop(0.5, `hsla(${p.hue}, 100%, 50%, ${alpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 100%, 40%, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);

        // Add core glow
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add occasional new particles with spread
      if (Math.random() < 0.3) {
        particles.push(createParticle());
      }

      time += 1;
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
