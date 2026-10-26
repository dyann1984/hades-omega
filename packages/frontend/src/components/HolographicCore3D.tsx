import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

type SubAgent = Exclude<AgentName, 'HADES'>

const ORBIT_POSITIONS: Record<SubAgent, [number, number, number]> = {
  CHARON:     [  0,    2.1,  0 ],
  PERSEPHONE: [  2.0,  1.05, 0 ],
  MINOS:      [  2.0, -1.05, 0 ],
  ELYSIUM:    [  0,   -2.1,  0 ],
  TARTARUS:   [ -2.0, -1.05, 0 ],
}

const AGENT_COLOR: Record<AgentName, string> = {
  HADES:      '#FFD700',
  CHARON:     '#00D4FF',
  PERSEPHONE: '#00CCEE',
  MINOS:      '#00BBDD',
  ELYSIUM:    '#00D4FF',
  TARTARUS:   '#0099CC',
}

// ─── HADES CORE ─────────────────────────────────────────────────────────────

function HadesCore({ active }: { active: boolean }) {
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const coreRef  = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.18
      outerRef.current.rotation.x = Math.sin(t * 0.07) * 0.15
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * 0.33
      innerRef.current.rotation.z =  t * 0.12
    }
    if (coreRef.current) {
      const scale = active ? 1 + Math.sin(t * 3.5) * 0.07 : 1
      coreRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group>
      {/* Outer gold icosahedron wireframe */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[0.58, 2]} />
        <meshBasicMaterial color="#FFD700" wireframe transparent opacity={active ? 0.55 : 0.22} />
      </mesh>

      {/* Inner octahedron wireframe */}
      <mesh ref={innerRef}>
        <octahedronGeometry args={[0.37, 0]} />
        <meshBasicMaterial color="#FFE060" wireframe transparent opacity={active ? 0.72 : 0.42} />
      </mesh>

      {/* Emissive gold core sphere */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={active ? 0.9 : 0.35}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>

      {/* Soft glow aura */}
      <mesh>
        <sphereGeometry args={[0.26, 8, 8]} />
        <meshBasicMaterial color="#FFD700" transparent opacity={active ? 0.1 : 0.04} />
      </mesh>

      <pointLight color="#FFD700" intensity={active ? 2.5 : 1.0} distance={4} decay={2} />
    </group>
  )
}

// ─── ORBIT RINGS ────────────────────────────────────────────────────────────

function OrbitRing({ radius, tube, tiltX, tiltZ, color, opacity, speed }: {
  radius: number; tube: number
  tiltX: number; tiltZ: number
  color: string; opacity: number; speed: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * speed
  })
  return (
    <mesh ref={ref} rotation={[tiltX, 0, tiltZ]}>
      <torusGeometry args={[radius, tube, 4, 72]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

// ─── ENERGY FIELD ───────────────────────────────────────────────────────────

function EnergyField({ active }: { active: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.rotation.x = t * 0.025
    ref.current.rotation.z = t * 0.018
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[2.15, 1]} />
      <meshBasicMaterial
        color={active ? '#00D4FF' : '#334466'}
        wireframe
        transparent
        opacity={active ? 0.045 : 0.02}
      />
    </mesh>
  )
}

// ─── PARTICLE CLOUD ─────────────────────────────────────────────────────────

function ParticleCloud() {
  const ref = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const count = 80
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 2.25 + Math.random() * 0.5
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.045
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#00D4FF" size={0.032} transparent opacity={0.38} sizeAttenuation />
    </points>
  )
}

// ─── AGENT NODES ────────────────────────────────────────────────────────────

function AgentNode({ name, position }: { name: SubAgent; position: [number, number, number] }) {
  const ref   = useRef<THREE.Mesh>(null)
  const agent = useHadesStore(s => s.agents[name])
  const active   = agent?.status !== 'IDLE'
  const isError  = agent?.status === 'ERROR'
  const isWait   = agent?.status === 'WAITING'
  const hex      = isError ? '#FF3366' : isWait ? '#FFB800' : AGENT_COLOR[name]
  const color    = new THREE.Color(hex)

  useFrame(({ clock }) => {
    if (!ref.current || !active) return
    ref.current.rotation.y = clock.getElapsedTime() * 1.8
    ref.current.rotation.x = clock.getElapsedTime() * 0.9
  })

  return (
    <group position={position}>
      {/* Node body */}
      <mesh ref={ref}>
        <sphereGeometry args={[active ? 0.14 : 0.11, 8, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 0.75 : 0.05}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
      {/* Orbital ring around the node */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.013, 4, 28]} />
        <meshBasicMaterial color={hex} transparent opacity={active ? 0.6 : 0.15} />
      </mesh>
      {active && <pointLight color={hex} intensity={0.55} distance={1.2} decay={2} />}
    </group>
  )
}

// ─── CONNECTION LINES ───────────────────────────────────────────────────────

function ConnectionLines() {
  const agents = useHadesStore(s => s.agents)
  const center: [number, number, number] = [0, 0, 0]

  return (
    <>
      {(Object.entries(ORBIT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => {
        const a      = agents[name]
        const active = a?.status !== 'IDLE'
        const color  = active ? AGENT_COLOR[name] : '#1A1A2E'
        return (
          <Line
            key={name}
            points={[center, pos]}
            color={color}
            lineWidth={active ? 1.2 : 0.4}
            opacity={active ? 0.72 : 0.22}
            transparent
            dashed={!active}
            dashSize={0.12}
            gapSize={0.12}
          />
        )
      })}
    </>
  )
}

// ─── CANVAS ─────────────────────────────────────────────────────────────────

export default function HolographicCore3D() {
  const agents = useHadesStore(s => s.agents)
  const active = Object.values(agents).some(a => a.status !== 'IDLE')

  return (
    <Canvas
      camera={{ position: [0, 0, 5.8], fov: 48 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <PerformanceMonitor onDecline={() => {}} />

      <ambientLight intensity={0.12} color="#2244AA" />
      <pointLight position={[0, 3, 2]}   color="#FFD700" intensity={1.4} decay={2} />
      <pointLight position={[-2, -1, 2]} color="#00D4FF" intensity={0.9} decay={2} />
      {active && <pointLight position={[2, 0, -1]} color="#00AAFF" intensity={0.55} decay={2} />}

      <EnergyField active={active} />
      <ParticleCloud />

      <OrbitRing radius={1.05} tube={0.018} tiltX={0}   tiltZ={0}   color="#00D4FF" opacity={0.50} speed={0.22}  />
      <OrbitRing radius={1.38} tube={0.015} tiltX={1.1}  tiltZ={0}   color="#00AAEE" opacity={0.32} speed={-0.15} />
      <OrbitRing radius={1.65} tube={0.012} tiltX={0}    tiltZ={0.8} color="#0088CC" opacity={0.20} speed={0.08}  />

      <HadesCore active={active} />
      <ConnectionLines />

      {(Object.entries(ORBIT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => (
        <AgentNode key={name} name={name} position={pos} />
      ))}
    </Canvas>
  )
}
