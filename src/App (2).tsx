import { useEffect, useRef, useState } from 'react';

/* ==================== Types ==================== */
interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface Cube {
  id: number;
  gridCol: number;   // grid ustun indeksi
  gridRow: number;   // grid qator indeksi
  x: number;        // canvas pixel X
  y: number;        // canvas pixel Y
  size: number;
  color: string;
  birthTime: number;
  isGrabbed: boolean;
  grabTargetCol: number;
  grabTargetRow: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

/* ==================== Constants ==================== */
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9', '#E74C3C',
  '#2ECC71', '#3498DB', '#9B59B6', '#F39C12', '#1ABC9C',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
];

const HAND_CONNS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const CW = 1280;
const CH = 720;

// Grid sozlamalari
const GRID_COLS = 16;       // gorizontal kataklar soni
const GRID_ROWS = 9;        // vertikal kataklar soni
const CELL_W = CW / GRID_COLS;   // = 80px
const CELL_H = CH / GRID_ROWS;   // = 80px
const CUBE_SIZE = Math.min(CELL_W, CELL_H) * 0.7; // kubning yarmi katakdan kichik

/* ==================== Utility Functions ==================== */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function adjustColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

function dist2d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Pixel koordinatani grid katakchaga aylantirish
function pixelToGrid(px: number, py: number): { col: number; row: number } {
  const col = Math.floor(px / CELL_W);
  const row = Math.floor(py / CELL_H);
  return {
    col: Math.max(0, Math.min(GRID_COLS - 1, col)),
    row: Math.max(0, Math.min(GRID_ROWS - 1, row)),
  };
}

// Grid katakchaning markazini pixel koordinataga aylantirish
function gridToPixel(col: number, row: number): { x: number; y: number } {
  return {
    x: col * CELL_W + CELL_W / 2,
    y: row * CELL_H + CELL_H / 2,
  };
}

/* ==================== Gesture Detection ==================== */
function isFingerExtended(lm: Landmark[], tip: number, pip: number): boolean {
  const wrist = lm[0];
  const tipDist = Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y);
  const pipDist = Math.hypot(lm[pip].x - wrist.x, lm[pip].y - wrist.y);
  return tipDist > pipDist * 1.05;
}

function isIndexPointing(lm: Landmark[]): boolean {
  return (
    isFingerExtended(lm, 8, 6) &&
    !isFingerExtended(lm, 12, 10) &&
    !isFingerExtended(lm, 16, 14) &&
    !isFingerExtended(lm, 20, 18)
  );
}

function isPinching(lm: Landmark[]): boolean {
  return dist2d(lm[4], lm[8]) < 0.07;
}

function areHandsJoined(a: Landmark[], b: Landmark[]): boolean {
  const d1 = dist2d(a[9], b[9]);
  const d2 = dist2d(a[0], b[0]);
  return d1 < 0.18 || d2 < 0.15;
}

/* ==================== Drawing Functions ==================== */

// Grid chiziqlarini chizish
function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();

  // Asosiy grid chiziqlar
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.18)';
  ctx.lineWidth = 1;

  for (let col = 0; col <= GRID_COLS; col++) {
    const x = col * CELL_W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CH);
    ctx.stroke();
  }

  for (let row = 0; row <= GRID_ROWS; row++) {
    const y = row * CELL_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.stroke();
  }

  // Grid kesishma nuqtalari (dots)
  ctx.fillStyle = 'rgba(100, 200, 255, 0.25)';
  for (let col = 0; col <= GRID_COLS; col++) {
    for (let row = 0; row <= GRID_ROWS; row++) {
      ctx.beginPath();
      ctx.arc(col * CELL_W, row * CELL_H, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// Aktiv katakni highlight qilish
function drawCellHighlight(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  color: string,
  occupied: boolean
) {
  const x = col * CELL_W;
  const y = row * CELL_H;

  ctx.save();

  if (occupied) {
    // Katakda kub bor - qizil
    ctx.fillStyle = 'rgba(255, 80, 80, 0.12)';
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.5)';
  } else {
    // Bo'sh katak - yashil
    ctx.fillStyle = 'rgba(80, 255, 120, 0.10)';
    ctx.strokeStyle = color;
  }

  ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
  ctx.setLineDash([]);

  // Koordinata ko'rsatish
  ctx.font = '10px monospace';
  ctx.fillStyle = occupied ? 'rgba(255,100,100,0.8)' : 'rgba(100,255,150,0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${col},${row}`, x + 4, y + 4);

  ctx.restore();
}

function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  w: number,
  h: number
) {
  ctx.strokeStyle = 'rgba(0, 255, 170, 0.7)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [a, b] of HAND_CONNS) {
    ctx.beginPath();
    ctx.moveTo((1 - lm[a].x) * w, lm[a].y * h);
    ctx.lineTo((1 - lm[b].x) * w, lm[b].y * h);
    ctx.stroke();
  }

  for (let i = 0; i < lm.length; i++) {
    const px = (1 - lm[i].x) * w;
    const py = lm[i].y * h;
    const isTip = [4, 8, 12, 16, 20].includes(i);

    ctx.beginPath();
    ctx.arc(px, py, isTip ? 6 : 4, 0, Math.PI * 2);

    if (isTip) {
      ctx.fillStyle = 'rgba(255, 255, 100, 0.9)';
      ctx.shadowColor = 'rgba(255, 255, 100, 0.5)';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
}

// Izometrik 3D kub - GRID markazida, to'g'ri joylashgan
function draw3DCube(
  ctx: CanvasRenderingContext2D,
  cx: number,   // pixel markazX
  cy: number,   // pixel markazY
  size: number, // kub kattaligi
  color: string,
  isGrabbed: boolean,
  scale: number,
  coordText: string
) {
  const s = size * scale;
  if (s < 2) return;

  ctx.save();
  ctx.translate(cx, cy);

  // Izometrik offset
  const depth = s * 0.38;
  const dx = depth * 0.85;
  const dy = depth * 0.55;

  // Soya (ellipse, markaz pastida)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, s / 2 + 6, s * 0.52, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Grab glow
  if (isGrabbed) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
  }

  // OLD yuz (front) - to'rtburchak, markaz (0,0) da
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-s / 2, -s / 2, s, s);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // UST yuz (top face)
  ctx.fillStyle = adjustColor(color, 55);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-s / 2, -s / 2);
  ctx.lineTo(-s / 2 + dx, -s / 2 - dy);
  ctx.lineTo(s / 2 + dx, -s / 2 - dy);
  ctx.lineTo(s / 2, -s / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // O'NG yuz (right face)
  ctx.fillStyle = adjustColor(color, -55);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(s / 2, -s / 2);
  ctx.lineTo(s / 2 + dx, -s / 2 - dy);
  ctx.lineTo(s / 2 + dx, s / 2 - dy);
  ctx.lineTo(s / 2, s / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shine gradient
  const grad = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(-s / 2, -s / 2, s, s);

  // Koordinata yozuvi (kubning oldida)
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${Math.round(s * 0.22)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(coordText, 0, 0);

  // Grab ko'rsatgich
  if (isGrabbed) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pinching: boolean,
  now: number
) {
  ctx.save();

  const radius = pinching ? 14 : 9;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = pinching
    ? 'rgba(255, 80, 80, 0.8)'
    : 'rgba(80, 255, 120, 0.75)';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const pulse = Math.sin(now * 0.006) * 6 + 20;
  ctx.beginPath();
  ctx.arc(x, y, pulse, 0, Math.PI * 2);
  ctx.strokeStyle = pinching
    ? 'rgba(255, 80, 80, 0.3)'
    : 'rgba(80, 255, 120, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!pinching) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 22, y); ctx.lineTo(x - 9, y);
    ctx.moveTo(x + 9, y); ctx.lineTo(x + 22, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x, y - 9);
    ctx.moveTo(x, y + 9); ctx.lineTo(x, y + 22);
    ctx.stroke();
  }

  ctx.restore();
}

/* ==================== Main Component ==================== */
export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    cubes: [] as Cube[],
    particles: [] as Particle[],
    grabbedId: null as number | null,
    lastCreateTime: 0,
    lastDeleteTime: 0,
    nextId: 1,
    pointingFrames: 0,
    cursorCol: 0,
    cursorRow: 0,
  });

  const [status, setStatus] = useState('🎥 Kamera yuklanmoqda...');
  const [cubeCount, setCubeCount] = useState(0);
  const [gesture, setGesture] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function init() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;

      let tries = 0;
      while (!W.Hands && tries < 200) {
        await new Promise((r) => setTimeout(r, 150));
        tries++;
      }

      if (!W.Hands || !active) {
        if (active) {
          setStatus('❌ MediaPipe yuklanmadi. Sahifani yangilang.');
          setLoading(false);
        }
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const ctx = canvas.getContext('2d')!;

      const handTracker = new W.Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      handTracker.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handTracker.onResults((results: any) => {
        if (!active) return;
        const S = stateRef.current;
        const now = Date.now();

        /* ---- Video chizish (mirror) ---- */
        ctx.save();
        ctx.clearRect(0, 0, CW, CH);
        ctx.translate(CW, 0);
        ctx.scale(-1, 1);
        if (results.image) {
          ctx.drawImage(results.image, 0, 0, CW, CH);
        }
        ctx.restore();

        // Qoraytirish overlay
        ctx.fillStyle = 'rgba(0,0,10, 0.45)';
        ctx.fillRect(0, 0, CW, CH);

        /* ---- GRID chizish ---- */
        drawGrid(ctx);

        const detectedHands: Landmark[][] = results.multiHandLandmarks || [];

        /* ---- Qo'l skeleti ---- */
        for (const lm of detectedHands) {
          drawHandSkeleton(ctx, lm, CW, CH);
        }

        /* ---- Gesture ---- */
        let newGesture = '';

        if (detectedHands.length === 1) {
          const lm = detectedHands[0];
          const pointing = isIndexPointing(lm);
          const pinch = isPinching(lm);

          // Ko'rsatkich barmoq pozitsiyasi (mirrored)
          const ix = (1 - lm[8].x) * CW;
          const iy = lm[8].y * CH;
          const { col: curCol, row: curRow } = pixelToGrid(ix, iy);
          S.cursorCol = curCol;
          S.cursorRow = curRow;

          if (pointing) {
            S.pointingFrames++;

            // Aktiv katakni highlight
            const occupied = S.cubes.some(
              (c) => c.gridCol === curCol && c.gridRow === curRow
            );
            drawCellHighlight(
              ctx, curCol, curRow,
              'rgba(80,255,120,0.6)',
              occupied
            );

            if (
              S.pointingFrames >= 5 &&
              now - S.lastCreateTime > 1200 &&
              !occupied
            ) {
              if (S.cubes.length < GRID_COLS * GRID_ROWS) {
                newGesture = '☝️ Kub yaratildi!';
                const { x: gx, y: gy } = gridToPixel(curCol, curRow);
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                S.cubes.push({
                  id: S.nextId++,
                  gridCol: curCol,
                  gridRow: curRow,
                  x: gx,
                  y: gy,
                  size: CUBE_SIZE,
                  color,
                  birthTime: now,
                  isGrabbed: false,
                  grabTargetCol: curCol,
                  grabTargetRow: curRow,
                });
                S.lastCreateTime = now;
                S.pointingFrames = 0;
                setCubeCount(S.cubes.length);

                // Particle
                for (let i = 0; i < 18; i++) {
                  const angle = (Math.PI * 2 * i) / 18;
                  S.particles.push({
                    x: gx, y: gy,
                    vx: Math.cos(angle) * (3 + Math.random() * 5),
                    vy: Math.sin(angle) * (3 + Math.random() * 5),
                    life: 1, color,
                    size: 3 + Math.random() * 5,
                  });
                }
              } else {
                newGesture = '⚠️ Grid to\'ldi!';
              }
            } else if (occupied && S.pointingFrames >= 5) {
              newGesture = '⚠️ Bu katak band!';
            } else {
              newGesture = `☝️ Ko'rsatkich → Kub yaratish [${curCol},${curRow}]`;
            }
            S.grabbedId = null;

          } else if (pinch) {
            S.pointingFrames = 0;
            const px = (1 - lm[8].x) * CW;
            const py = lm[8].y * CH;
            const { col: pCol, row: pRow } = pixelToGrid(px, py);

            if (S.grabbedId === null) {
              // Kub topish
              for (let i = S.cubes.length - 1; i >= 0; i--) {
                const c = S.cubes[i];
                if (c.gridCol === pCol && c.gridRow === pRow) {
                  S.grabbedId = c.id;
                  c.isGrabbed = true;
                  newGesture = `🤏 Kub ushlandi [${c.gridCol},${c.gridRow}]`;
                  break;
                }
              }
              if (S.grabbedId === null) {
                // Pixel bo'yicha ham tekshirish (aniqroq)
                for (let i = S.cubes.length - 1; i >= 0; i--) {
                  const c = S.cubes[i];
                  if (
                    Math.abs(px - c.x) < CUBE_SIZE * 0.85 &&
                    Math.abs(py - c.y) < CUBE_SIZE * 0.85
                  ) {
                    S.grabbedId = c.id;
                    c.isGrabbed = true;
                    newGesture = `🤏 Kub ushlandi [${c.gridCol},${c.gridRow}]`;
                    break;
                  }
                }
              }
              if (S.grabbedId === null) {
                newGesture = '🤏 Pinch → Kubga yaqinlashing';
              }
            } else {
              // Kubni harakatlantirish - yangi katakka snap
              const cube = S.cubes.find((c) => c.id === S.grabbedId);
              if (cube) {
                const targetOccupied = S.cubes.some(
                  (c) =>
                    c.id !== cube.id &&
                    c.gridCol === pCol &&
                    c.gridRow === pRow
                );
                if (!targetOccupied) {
                  cube.grabTargetCol = pCol;
                  cube.grabTargetRow = pRow;
                }
                // Smooth snap: kubni target katakka siljitish
                const { x: tx, y: ty } = gridToPixel(
                  cube.grabTargetCol,
                  cube.grabTargetRow
                );
                cube.x += (tx - cube.x) * 0.25;
                cube.y += (ty - cube.y) * 0.25;

                // Highlight target katak
                drawCellHighlight(
                  ctx,
                  cube.grabTargetCol,
                  cube.grabTargetRow,
                  'rgba(255,200,50,0.7)',
                  false
                );
                newGesture = `🤏 Harakatlantirish → [${cube.grabTargetCol},${cube.grabTargetRow}]`;
              }
            }
          } else {
            // Qo'l ochiq - grabbedni qo'yib yuborish, snap qilish
            if (S.grabbedId !== null) {
              const cube = S.cubes.find((c) => c.id === S.grabbedId);
              if (cube) {
                cube.isGrabbed = false;
                // Snap to grid
                cube.gridCol = cube.grabTargetCol;
                cube.gridRow = cube.grabTargetRow;
                const { x: sx, y: sy } = gridToPixel(cube.gridCol, cube.gridRow);
                cube.x = sx;
                cube.y = sy;
              }
            }
            S.pointingFrames = 0;
            S.grabbedId = null;
          }

        } else if (detectedHands.length === 2) {
          // Grab qo'yib yuborish
          if (S.grabbedId !== null) {
            const cube = S.cubes.find((c) => c.id === S.grabbedId);
            if (cube) {
              cube.isGrabbed = false;
              cube.gridCol = cube.grabTargetCol;
              cube.gridRow = cube.grabTargetRow;
              const { x: sx, y: sy } = gridToPixel(cube.gridCol, cube.gridRow);
              cube.x = sx;
              cube.y = sy;
            }
          }
          S.pointingFrames = 0;
          S.grabbedId = null;

          if (areHandsJoined(detectedHands[0], detectedHands[1])) {
            if (now - S.lastDeleteTime > 800 && S.cubes.length > 0) {
              const removed = S.cubes.pop()!;
              removed.isGrabbed = false;
              S.lastDeleteTime = now;
              setCubeCount(S.cubes.length);
              newGesture = `🙏 Kub o'chirildi! [${removed.gridCol},${removed.gridRow}]`;

              for (let i = 0; i < 32; i++) {
                S.particles.push({
                  x: removed.x,
                  y: removed.y,
                  vx: (Math.random() - 0.5) * 16,
                  vy: (Math.random() - 0.5) * 16,
                  life: 1,
                  color: removed.color,
                  size: 4 + Math.random() * 8,
                });
              }
            } else if (S.cubes.length === 0) {
              newGesture = '🙏 Hech qanday kub yo\'q';
            } else {
              newGesture = '🙏 Qo\'llar birlashtirildi → O\'chirish';
            }
          } else {
            newGesture = '✌️ Ikki qo\'l aniqlandi';
          }
        } else {
          if (S.grabbedId !== null) {
            const cube = S.cubes.find((c) => c.id === S.grabbedId);
            if (cube) {
              cube.isGrabbed = false;
              cube.gridCol = cube.grabTargetCol;
              cube.gridRow = cube.grabTargetRow;
              const { x: sx, y: sy } = gridToPixel(cube.gridCol, cube.gridRow);
              cube.x = sx;
              cube.y = sy;
            }
          }
          S.pointingFrames = 0;
          S.grabbedId = null;
        }

        setGesture(newGesture);
        setStatus(
          detectedHands.length > 0
            ? `✅ ${detectedHands.length} ta qo'l aniqlandi`
            : '👋 Qo\'lingizni kameraga ko\'rsating'
        );

        /* ---- Particles ---- */
        for (let i = S.particles.length - 1; i >= 0; i--) {
          const p = S.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15;
          p.vx *= 0.97;
          p.life -= 0.022;

          if (p.life <= 0) {
            S.particles.splice(i, 1);
            continue;
          }

          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        /* ---- Kublarni chizish ---- */
        for (const cube of S.cubes) {
          const age = now - cube.birthTime;
          const scaleRaw = Math.min(1, age / 350);
          const scale = 1 - Math.pow(1 - scaleRaw, 3);

          // Agar grab emas bo'lsa - animatsiyali snap
          if (!cube.isGrabbed) {
            const { x: tx, y: ty } = gridToPixel(cube.gridCol, cube.gridRow);
            cube.x += (tx - cube.x) * 0.35;
            cube.y += (ty - cube.y) * 0.35;
          }

          draw3DCube(
            ctx,
            cube.x,
            cube.y,
            cube.size,
            cube.color,
            cube.isGrabbed,
            scale,
            `${cube.gridCol},${cube.gridRow}`
          );
        }

        /* ---- Cursor ---- */
        if (detectedHands.length >= 1) {
          const lm = detectedHands[0];
          const ix = (1 - lm[8].x) * CW;
          const iy = lm[8].y * CH;
          drawCursor(ctx, ix, iy, isPinching(lm), now);
        }
      });

      setStatus('🤖 AI modeli yuklanmoqda...');

      try {
        const camera = new W.Camera(video, {
          onFrame: async () => {
            if (active) {
              await handTracker.send({ image: video });
            }
          },
          width: CW,
          height: CH,
        });
        await camera.start();
        if (active) {
          setStatus('👋 Qo\'lingizni kameraga ko\'rsating');
          setLoading(false);
        }
      } catch {
        if (active) {
          setStatus('❌ Kamera ruxsati berilmadi yoki kamera topilmadi');
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative w-screen h-screen bg-gray-950 overflow-hidden flex items-center justify-center">
      <video ref={videoRef} className="hidden" playsInline autoPlay muted />

      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="max-w-full max-h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-gray-950/92 flex flex-col items-center justify-center z-50 gap-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-cyan-500/30 rounded-full animate-spin border-t-cyan-400" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">🖐️</div>
          </div>
          <div className="text-white text-center space-y-2">
            <h2 className="text-xl font-bold">{status}</h2>
            <p className="text-gray-400 text-sm">Kamera va AI modeli tayyorlanmoqda...</p>
            <p className="text-gray-500 text-xs">Kamera ruxsatini berishni unutmang</p>
          </div>

          {/* Grid preview */}
          <div className="mt-4 border border-cyan-500/20 rounded-xl p-4 bg-black/30">
            <p className="text-cyan-400 text-xs text-center mb-2 font-mono">
              {GRID_COLS} × {GRID_ROWS} = {GRID_COLS * GRID_ROWS} ta katak
            </p>
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${Math.min(GRID_COLS, 8)}, 1fr)`,
              }}
            >
              {Array.from({ length: Math.min(GRID_COLS * GRID_ROWS, 64) }).map((_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 border border-cyan-500/20 rounded-sm bg-cyan-500/5"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOP LEFT - Status */}
      <div className="absolute top-3 left-3 pointer-events-none z-10">
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl px-4 py-3 text-white space-y-1.5 border border-white/10 shadow-2xl max-w-xs">
          <h1 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
            <span className="text-lg">🖐️</span>
            Qo&apos;l bilan Boshqarish
          </h1>
          <p className="text-xs text-gray-300">{status}</p>
          {gesture && (
            <div className="bg-yellow-500/15 rounded-lg px-2.5 py-1.5 border border-yellow-500/25">
              <p className="text-xs text-yellow-200 font-mono">{gesture}</p>
            </div>
          )}
        </div>
      </div>

      {/* TOP RIGHT - Stats */}
      <div className="absolute top-3 right-3 pointer-events-none z-10 flex flex-col gap-2">
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl px-5 py-3 text-white text-center border border-white/10 shadow-2xl">
          <div className="text-4xl font-black bg-gradient-to-b from-cyan-300 to-blue-500 bg-clip-text text-transparent">
            {cubeCount}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">
            Kublar
          </div>
        </div>
        <div className="bg-black/60 backdrop-blur-xl rounded-xl px-3 py-2 text-center border border-white/10">
          <div className="text-xs font-mono text-cyan-400">
            {GRID_COLS}×{GRID_ROWS}
          </div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Grid</div>
        </div>
      </div>

      {/* BOTTOM - Instructions */}
      <div className="absolute bottom-3 left-3 right-3 flex justify-center pointer-events-none z-10">
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl px-5 py-3 text-white border border-white/10 shadow-2xl">
          <div className="flex gap-6 sm:gap-10 text-center">
            <div className="space-y-1">
              <div className="text-2xl">☝️</div>
              <div className="text-[11px] font-semibold">Ko&apos;rsatkich</div>
              <div className="text-[9px] text-emerald-400 font-mono">Kub yaratish</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="space-y-1">
              <div className="text-2xl">🤏</div>
              <div className="text-[11px] font-semibold">Pinch qilish</div>
              <div className="text-[9px] text-blue-400 font-mono">Kubni surish</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="space-y-1">
              <div className="text-2xl">🙏</div>
              <div className="text-[11px] font-semibold">Qo&apos;l birlashtirish</div>
              <div className="text-[9px] text-red-400 font-mono">Kubni o&apos;chirish</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="space-y-1">
              <div className="text-2xl">📐</div>
              <div className="text-[11px] font-semibold">Grid snap</div>
              <div className="text-[9px] text-yellow-400 font-mono">Auto joylashish</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
