import React, { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
}

interface GraduationCapPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  size: number;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
}

const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

export default function ConfettiAnimation() {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [graduationCaps, setGraduationCaps] = useState<GraduationCapPiece[]>([]);

  useEffect(() => {
    // Create initial confetti pieces
    const initialConfetti: ConfettiPiece[] = [];
    const initialCaps: GraduationCapPiece[] = [];

    // Generate confetti
    for (let i = 0; i < 100; i++) {
      initialConfetti.push({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -10,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        velocityX: (Math.random() - 0.5) * 4,
        velocityY: Math.random() * 3 + 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }

    // Generate graduation caps
    for (let i = 0; i < 15; i++) {
      initialCaps.push({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -50,
        rotation: Math.random() * 360,
        size: Math.random() * 20 + 20,
        velocityX: (Math.random() - 0.5) * 3,
        velocityY: Math.random() * 2 + 1,
        rotationSpeed: (Math.random() - 0.5) * 8,
      });
    }

    setConfetti(initialConfetti);
    setGraduationCaps(initialCaps);

    // Animation loop
    const animationInterval = setInterval(() => {
      setConfetti(prev => prev.map(piece => ({
        ...piece,
        x: piece.x + piece.velocityX,
        y: piece.y + piece.velocityY,
        rotation: piece.rotation + piece.rotationSpeed,
        velocityY: piece.velocityY + 0.1, // gravity
      })).filter(piece => piece.y < window.innerHeight + 50));

      setGraduationCaps(prev => prev.map(cap => ({
        ...cap,
        x: cap.x + cap.velocityX,
        y: cap.y + cap.velocityY,
        rotation: cap.rotation + cap.rotationSpeed,
        velocityY: cap.velocityY + 0.05, // lighter gravity for caps
      })).filter(cap => cap.y < window.innerHeight + 100));
    }, 16);

    // Clean up after 8 seconds
    const cleanup = setTimeout(() => {
      clearInterval(animationInterval);
      setConfetti([]);
      setGraduationCaps([]);
    }, 8000);

    return () => {
      clearInterval(animationInterval);
      clearTimeout(cleanup);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Confetti pieces */}
      {confetti.map(piece => (
        <div
          key={piece.id}
          className="absolute"
          style={{
            left: `${piece.x}px`,
            top: `${piece.y}px`,
            transform: `rotate(${piece.rotation}deg)`,
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
          }}
        />
      ))}

      {/* Graduation caps */}
      {graduationCaps.map(cap => (
        <div
          key={`cap-${cap.id}`}
          className="absolute text-gray-800"
          style={{
            left: `${cap.x}px`,
            top: `${cap.y}px`,
            transform: `rotate(${cap.rotation}deg)`,
            fontSize: `${cap.size}px`,
          }}
        >
          🎓
        </div>
      ))}

      {/* Celebration message overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl border-2 border-green-200 text-center animate-pulse">
          <div className="flex items-center justify-center mb-4">
            <GraduationCap className="w-16 h-16 text-green-600 mr-4" />
            <div>
              <h2 className="text-4xl font-bold text-green-800 mb-2">¡Felicitaciones!</h2>
              <p className="text-xl text-green-700">Has completado toda la malla curricular</p>
            </div>
          </div>
          <div className="text-6xl animate-bounce">🎉</div>
        </div>
      </div>
    </div>
  );
}
