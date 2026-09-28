"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Database, Zap, Shield, Clock } from "lucide-react";

// ── Lightweight 3D canvas — floating geometric nodes ─────────────────────────
function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = 36;
    const nodes = Array.from({ length: count }, () => ({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      z:  Math.random() * 0.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r:  Math.random() * 2.5 + 1.5,
      pulse: Math.random() * Math.PI * 2,
    }));

    let angle = 0;
    const cx = () => canvas.width  * 0.5;
    const cy = () => canvas.height * 0.38;
    const size = 80;

    function project(x: number, y: number, z: number) {
      const fov = 320;
      const scale = fov / (fov + z);
      return { x: x * scale, y: y * scale, scale };
    }

    function drawCube() {
      if (!ctx || !canvas) return;
      const a = angle;
      const b = angle * 0.6;
      const verts3d: [number, number, number][] = [
        [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
        [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1],
      ];
      const rotated = verts3d.map(([x, y, z]) => {
        const x1 = x * Math.cos(a) - z * Math.sin(a);
        const z1 = x * Math.sin(a) + z * Math.cos(a);
        const y1 = y * Math.cos(b) - z1 * Math.sin(b);
        const z2 = y * Math.sin(b) + z1 * Math.cos(b);
        return [x1 * size, y1 * size, z2 * size + 120] as [number, number, number];
      });
      const proj = rotated.map(([x, y, z]) => project(x, y, z));
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      ctx.save();
      ctx.translate(cx(), cy());
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(proj[a].x, proj[a].y);
        ctx.lineTo(proj[b].x, proj[b].y);
        ctx.stroke();
      });
      proj.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fill();
      });
      ctx.restore();
    }

    let raf: number;
    function frame() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.005;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / 130) * 0.15})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      nodes.forEach(n => {
        n.pulse += 0.03;
        const glow = Math.sin(n.pulse) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * n.z * glow, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.22 * n.z * glow})`;
        ctx.fill();
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });

      drawCube();
      raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />;
}

const FEATURES = [
  { icon: Zap,    title: "Image → SQL in Seconds",   desc: "Upload any ER diagram and get production-ready DDL instantly" },
  { icon: Shield, title: "4 Powerful Tools",          desc: "Quick Convert, Schema Generator, SQL Migrator & Playground" },
  { icon: Clock,  title: "Multi-dialect Support",     desc: "PostgreSQL, MySQL, SQLite, MSSQL & Oracle" },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] flex">

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[520px] xl:w-[580px] flex-col relative overflow-hidden flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #1E1040 0%, #2D1B69 50%, #4C1D95 100%)" }}>

        <ThreeBackground />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />

        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <Database size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl leading-none">Schemalens</p>
              <p className="text-white/50 text-sm mt-0.5">AI-Powered Schema Toolkit</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Tagline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mb-10"
          >
            <h2 className="text-white text-3xl xl:text-4xl font-bold leading-tight mb-4">
              Sketch it. Upload it.{" "}
              <span style={{
                background: "linear-gradient(90deg, #A78BFA, #60A5FA)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                Ship it.
              </span>
              <br />
              <span className="text-white/90 font-extrabold">
                Your database schema, instantly.
              </span>
            </h2>
            <p className="text-white/60 text-base leading-relaxed">
              Upload a diagram, describe your schema in plain English, migrate between dialects, or write SQL live — Schemalens handles it all.
            </p>
          </motion.div>

          {/* Feature list */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="space-y-3 mb-10"
          >
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-4 p-4 rounded-2xl bg-white/8 border border-white/10 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{title}</p>
                  <p className="text-white/55 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="grid grid-cols-3 gap-3"
          >
            {[["4+","AI Tools"],["5","SQL Dialects"],["ER+Text","Input Modes"]].map(([v, l]) => (
              <div key={l} className="text-center p-4 rounded-2xl bg-white/8 border border-white/10 backdrop-blur-sm">
                <div className="text-white font-bold text-2xl xl:text-3xl">{v}</div>
                <div className="text-white/50 text-xs mt-1">{l}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-[var(--surface)] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-lg"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs" style={{ background: "var(--primary)" }}>
              <Database size={20} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-[var(--text)]">Schemalens</span>
              <p className="text-xs text-[var(--text-muted)]">AI-Powered Schema Toolkit</p>
            </div>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  );
}
