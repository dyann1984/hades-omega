import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

const AGENT_POSITIONS: Record<AgentName, [number, number, number]> = {
  CHARON:     [ 0,    2.2,  0   ],
  PERSEPHONE: [ 2.1,  1.1,  0   ],
  MINOS:      [ 2.1, -1.1,  0   ],
  ELYSIUM:    [ 0,   -2.2,  0   ],
  TARTARUS:   [-2.1, -1.1,  0   ],
  HADES:      [ 0,    0,    0   ],
}

const AGENT_COLORS: Record<AgentName, string> = {
  HADES:      '#FFD700',
  CHARON:     '#00D4FF',
  PERSEPHONE: '#00D4FF',
  MINOS:      '#00D4FF',
  ELYSIUM:    '#00D4FF',
  TARTARUS:   '#00D4FF',
}

function HadesCore(): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const agents  = useHadesStore(s => s.agents)
  const anyActive = Object.values(agents).some(a => a.status !== 'IDLE')

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    meshRef.current.rotation.y = t * 0.3
    meshRef.current.rotation.x = Math.sin(t * 0.1) * 0.1

    if (glowRef.current) {
      const scale = anyActive ? 1.1 + Math.sin(t * 2) * 0.05 : 1
      glowRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group>
      {/* Glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.65, 16, 16]} />
        <meshBasicMaterial color="#FFD700" transparent opacity={0.04} />
      </mesh>

      {/* Icosahedron wireframe */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.55, 2]} />
        <meshBasicMaterial color="#FFD700" wireframe />
      </mesh>

      {/* Core solid */}
      <mesh>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#1A1A26" />
      </mesh>

      {/* HADES label */}
      <pointLight color="#FFD700" intensity={anyActive ? 2 : 0.8} distance={3} />
    </group>
  )
}

function AgentNode({ name, position }: { name: AgentName; position: [number, number, number] }): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const agent   = useHadesStore(s => s.agents[name])
  const active  = agent?.status !== 'IDLE'
  const color   = new THREE.Color(
    agent?.status === 'ERROR' ? '#FF3366'
    : agent?.status === 'WAITING' ? '#FFB800'
    : AGENT_COLORS[name],
  )

  useFrame(({ clock }) => {
    if (!meshRef.current || !active) return
    meshRef.current.rotation.y = clock.getElapsedTime() * 0.8
  })

  if (name === 'HADES') return <></>

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={color} wireframe={active} />
      </mesh>
      {active && <pointLight color={color} intensity={0.8} distance={1.5} />}
    </group>
  )
}

function ConnectionLines(): JSX.Element {
  const agents = useHadesStore(s => s.agents)
  const center: [number, number, number] = [0, 0, 0]

  return (
    <>
      {(Object.entries(AGENT_POSITIONS) as [AgentName, [number, number, number]][])
        .filter(([name]) => name !== 'HADES')
        .map(([name, pos]) => {
          const agent = agents[name]
          const active = agent?.status !== 'IDLE'
          const color = active ? AGENT_COLORS[name] : '#1E1E30'
          return (
            <Line
              key={name}
              points={[center, pos]}
              color={color}
              lineWidth={active ? 1 : 0.5}
              opacity={active ? 0.8 : 0.3}
              transparent
              dashed={!active}
              dashSize={0.1}
              gapSize={0.1}
            />
          )
        })}
    </>
  )
}

export default function HolographicCore3D(): JSX.Element {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <PerformanceMonitor onDecline={() => {}} />
      <ambientLight intensity={0.1} />

      <HadesCore />
      <ConnectionLines />

      {(Object.entries(AGENT_POSITIONS) as [AgentName, [number, number, number]][]).map(([name, pos]) => (
        <AgentNode key={name} name={name} position={pos} />
      ))}
    </Canvas>
  )
}
