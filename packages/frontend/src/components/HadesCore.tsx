import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

type SubAgent = Exclude<AgentName, 'HADES'>

// Strict palette: obsidian · electric blue · cold white · discrete gold
const P = {
  nucleusWhite:  '#cce8ff',
  coreEmissive:  '#0055ff',
  coreBody:      '#001a66',
  coreHalo:      '#002299',
  goldFrame:     '#6b5010',
  goldBright:    '#9a7010',
  nodeBase:      '#040c1e',
  nodeActive:    '#0a2040',
  wireField:     '#030a1a',
  particle:      '#001266',
  haloRing:      '#001a55',
  scanLine:      '#0033aa',
} as const

const AGENT_POSITIONS: Record<string, [number, number, number]> = {
  CHARON:     [  0.00,  2.20, 0 ],
  PERSEPHONE: [  2.09,  0.68, 0 ],
  MINOS:      [  1.29, -1.78, 0 ],
  ELYSIUM:    [ -1.29, -1.78, 0 ],
  TARTARUS:   [ -2.09,  0.68, 0 ],
}

// No orbit rings — they make the design look like an atom model.
// Depth comes from sacred geometry structure + field boundary + halo band.

// ─── WHITE-HOT NUCLEUS ───────────────────────────────────────────────────────
function Nucleus({ active, speed }: { active: boolean; speed: number }) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const pulse = active
      ? 1 + 0.22 * Math.sin(t * 3.5 * speed)
      : 1 + 0.07 * Math.sin(t * 1.4)
    ref.current.scale.setScalar(pulse)
    ;(ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      active ? 3.2 + Math.sin(t * 4) * 0.4 : 1.4
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.09, 20, 20]} />
      <meshStandardMaterial
        color={P.nucleusWhite}
        emissive={P.nucleusWhite}
        emissiveIntensity={1.4}
        metalness={0}
        roughness={0}
      />
    </mesh>
  )
}

// ─── ENERGY CORE ────────────────────────────────────────────────────────────
function EnergyCore({ active, speed }: { active: boolean; speed: number }) {
  const bodyRef  = useRef<THREE.Mesh>(null)
  const shellRef = useRef<THREE.Mesh>(null)
  const rimRef   = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (bodyRef.current) {
      bodyRef.current.rotation.y = t * 0.05 * speed
      ;(bodyRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        (active ? 0.95 : 0.40) + Math.sin(t * 2.2) * 0.12
    }
    if (shellRef.current) {
      shellRef.current.scale.setScalar(1 + (active ? 0.055 : 0.018) * Math.sin(t * 1.8))
    }
    if (rimRef.current) {
      ;(rimRef.current.material as THREE.MeshBasicMaterial).opacity =
        (active ? 0.055 : 0.022) + Math.sin(t * 1.8) * 0.01
    }
  })

  return (
    <group>
      <mesh ref={bodyRef}>
        <sphereGeometry args={[0.28, 32, 32]} />
        <meshStandardMaterial
          color={P.coreBody}
          emissive={P.coreEmissive}
          emissiveIntensity={0.40}
          metalness={0.1}
          roughness={0.4}
        />
      </mesh>
      <mesh ref={shellRef}>
        <sphereGeometry args={[0.40, 24, 24]} />
        <meshBasicMaterial
          color={P.coreHalo}
          transparent
          opacity={0.055}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
      <mesh ref={rimRef}>
        <sphereGeometry args={[0.58, 14, 14]} />
        <meshBasicMaterial
          color={P.coreEmissive}
          transparent
          opacity={0.022}
          depthWrite={false}
        />
      </mesh>
      <pointLight color={P.coreEmissive} intensity={active ? 3.2 : 1.4} distance={4.5} decay={2} />
    </group>
  )
}

// ─── GEOMETRIC FRAME (sacred geometry) ───────────────────────────────────────
function GeometricFrame({ active, speed }: { active: boolean; speed: number }) {
  const icosaRef = useRef<THREE.Mesh>(null)
  const octaRef  = useRef<THREE.Mesh>(null)
  const ringRef  = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed
    if (icosaRef.current) {
      icosaRef.current.rotation.y =  t * 0.065
      icosaRef.current.rotation.x = Math.sin(t * 0.04) * 0.09
    }
    if (octaRef.current) {
      octaRef.current.rotation.y = -t * 0.11
      octaRef.current.rotation.z =  t * 0.06
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.045
    }
  })

  return (
    <group>
      <mesh ref={icosaRef}>
        <icosahedronGeometry args={[0.74, 1]} />
        <meshBasicMaterial
          color={P.goldFrame}
          wireframe
          transparent
          opacity={active ? 0.32 : 0.16}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={octaRef}>
        <octahedronGeometry args={[0.50, 0]} />
        <meshBasicMaterial
          color={P.goldBright}
          wireframe
          transparent
          opacity={active ? 0.44 : 0.22}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[0.28, 0, 0.12]}>
        <torusGeometry args={[0.80, 0.004, 3, 100]} />
        <meshBasicMaterial
          color={P.goldFrame}
          transparent
          opacity={active ? 0.52 : 0.25}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// ─── OUTER FIELD ─────────────────────────────────────────────────────────────
function FieldBoundary({ alert }: { active: boolean; alert: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.y = clock.getElapsedTime() * 0.015
    ref.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.006) * 0.06
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[2.25, 1]} />
      <meshBasicMaterial
        color={alert ? '#150010' : P.wireField}
        wireframe
        transparent
        opacity={alert ? 0.08 : 0.045}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── HALO BAND ───────────────────────────────────────────────────────────────
function HaloBand() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.010
  })
  return (
    <mesh ref={ref} rotation={[Math.PI / 5.5, 0, 0]}>
      <torusGeometry args={[3.1, 0.005, 3, 160]} />
      <meshBasicMaterial color={P.haloRing} transparent opacity={0.07} depthWrite={false} />
    </mesh>
  )
}

// ─── PARTICLE FIELD ──────────────────────────────────────────────────────────
function ParticleField() {
  const ref = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const n = 110
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const r  = 1.6 + Math.random() * 1.5
      arr[i*3]   = r * Math.sin(ph) * Math.cos(th)
      arr[i*3+1] = r * Math.sin(ph) * Math.sin(th)
      arr[i*3+2] = r * Math.cos(ph)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.024
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={positions.length / 3} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color={P.particle}
        size={0.014}
        transparent
        opacity={0.18}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// ─── SCAN RING ───────────────────────────────────────────────────────────────
function ScanRing({ active }: { active: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || !active) return
    const t = clock.getElapsedTime()
    ref.current.rotation.y = t * 0.55
    ref.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.28) * 0.10
  })
  return (
    <mesh ref={ref} visible={active} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1.98, 0.003, 3, 100]} />
      <meshBasicMaterial color={P.scanLine} transparent opacity={0.14} depthWrite={false} />
    </mesh>
  )
}

// ─── PULSE WAVE ──────────────────────────────────────────────────────────────
function PulseWave({ trigger }: { trigger: number }) {
  const ref   = useRef<THREE.Mesh>(null)
  const start = useRef<number | null>(null)
  const prev  = useRef(trigger)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const mat = ref.current.material as THREE.MeshBasicMaterial
    if (prev.current !== trigger) {
      prev.current = trigger
      start.current = clock.getElapsedTime()
    }
    if (start.current !== null) {
      const p = Math.min(1, (clock.getElapsedTime() - start.current) / 2.2)
      ref.current.scale.setScalar(0.3 + p * 4.2)
      mat.opacity = (1 - p) * 0.20
      if (p >= 1) { start.current = null; mat.opacity = 0 }
    } else {
      mat.opacity = 0
    }
  })

  return (
    <mesh ref={ref} scale={0.01}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial color={P.coreEmissive} transparent opacity={0} depthWrite={false} wireframe />
    </mesh>
  )
}

// ─── AGENT NODE ──────────────────────────────────────────────────────────────
function AgentNode({ name, position }: { name: SubAgent; position: [number, number, number] }) {
  const ref   = useRef<THREE.Mesh>(null)
  const agent = useHadesStore(s => s.agents[name])

  const isActive = agent?.status !== 'IDLE'
  const isError  = agent?.status === 'ERROR'
  const isWait   = agent?.status === 'WAITING'

  const emissive = isError ? '#200010' : isWait ? '#1a1500' : P.coreBody

  useFrame(({ clock }) => {
    if (!ref.current || !isActive) return
    ;(ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.5 + Math.sin(clock.getElapsedTime() * 2.0 + position[0]) * 0.15
  })

  return (
    <group position={position}>
      <mesh ref={ref} rotation={[0.3, 0.5, 0.15]}>
        <octahedronGeometry args={[isActive ? 0.14 : 0.10, 0]} />
        <meshStandardMaterial
          color={isActive ? P.nodeActive : P.nodeBase}
          emissive={emissive}
          emissiveIntensity={isActive ? 0.5 : 0.04}
          metalness={0.92}
          roughness={0.10}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0.3]}>
        <torusGeometry args={[0.20, 0.003, 3, 36]} />
        <meshBasicMaterial
          color={P.goldFrame}
          transparent
          opacity={isActive ? 0.52 : 0.10}
          depthWrite={false}
        />
      </mesh>
      {isActive && <pointLight color={P.coreBody} intensity={0.5} distance={1.1} decay={2} />}
    </group>
  )
}

// ─── CONNECTION LINES ─────────────────────────────────────────────────────────
function Connections() {
  const agents = useHadesStore(s => s.agents)
  const center: [number, number, number] = [0, 0, 0]

  return (
    <>
      {(Object.entries(AGENT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => {
        const isActive = agents[name]?.status !== 'IDLE'
        const isError  = agents[name]?.status === 'ERROR'
        return (
          <Line
            key={name}
            points={[center, pos]}
            color={isError ? '#110008' : isActive ? P.coreHalo : '#020712'}
            lineWidth={isActive ? 0.7 : 0.28}
            opacity={isActive ? 0.50 : 0.08}
            transparent
            dashed={!isActive}
            dashSize={0.12}
            gapSize={0.18}
          />
        )
      })}
    </>
  )
}

// ─── SCENE CONTENT ───────────────────────────────────────────────────────────
function HadesCoreScene() {
  const agents    = useHadesStore(s => s.agents)
  const nearTxs   = useHadesStore(s => s.nearTxs)
  const auditRecs = useHadesStore(s => s.auditRecords)

  const anyActive = Object.values(agents).some(a => a.status !== 'IDLE')
  const hasAlert  = Object.values(agents).some(a => a.status === 'ERROR')
                 || auditRecs.some(r => r.guardDecision === 'DENY')
  const speed     = anyActive ? 2.1 : 1.0

  return (
    <>
      {/* Lighting — cool blue-dominant, low ambient */}
      <ambientLight intensity={0.05} color="#040c22" />
      <pointLight position={[0, 4.5, 2.5]}    color="#0033aa" intensity={1.2} decay={2} />
      <pointLight position={[-2.5, -1,  1.5]}  color="#001266" intensity={0.6} decay={2} />
      <pointLight position={[ 2.5,  1, -2]}    color="#000a1a" intensity={0.4} decay={2} />
      {hasAlert && <pointLight position={[0, 0, 2.5]} color="#220012" intensity={0.35} decay={2} />}

      {/* Back-to-front render order */}
      <HaloBand />
      <FieldBoundary active={anyActive} alert={hasAlert} />
      <ParticleField />
      <ScanRing active={anyActive} />

      <GeometricFrame active={anyActive} speed={speed} />
      <EnergyCore     active={anyActive} speed={speed} />
      <Nucleus        active={anyActive} speed={speed} />

      <Connections />
      <PulseWave trigger={nearTxs.length} />

      {(Object.entries(AGENT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([n, p]) => (
        <AgentNode key={n} name={n as SubAgent} position={p} />
      ))}

      {/* Controlled bloom — only nucleus/core emissive will exceed threshold 0.78 */}
      <EffectComposer>
        <Bloom
          intensity={0.35}
          luminanceThreshold={0.78}
          luminanceSmoothing={0.08}
          radius={0.60}
          mipmapBlur
        />
      </EffectComposer>
    </>
  )
}

// ─── SVG FALLBACK ─────────────────────────────────────────────────────────────
function CoreFallback(): JSX.Element {
  const agents    = useHadesStore(s => s.agents)
  const anyActive = Object.values(agents).some(a => a.status !== 'IDLE')

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg viewBox="0 0 400 400" className="w-full h-full max-w-sm" aria-label="HADES Core">
        <circle cx="200" cy="200" r="185" fill="none" stroke="#030a1a" strokeWidth="1" />
        <circle cx="200" cy="200" r="145" fill="none" stroke="#001a6622" strokeWidth="1" strokeDasharray="4 7" />
        {anyActive && <circle cx="200" cy="200" r="58" fill="#0033aa0f" className="animate-pulse" />}
        <circle cx="200" cy="200" r="50" fill="#000408" stroke="#0044cc" strokeWidth="1.2" />
        <text x="200" y="196" textAnchor="middle" fill="#0055ff" fontSize="18" fontFamily="Space Grotesk">✦</text>
        <text x="200" y="214" textAnchor="middle" fill="#3366aa" fontSize="9" fontFamily="JetBrains Mono" fontWeight="600">HADES</text>
      </svg>
    </div>
  )
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function HadesCore(): JSX.Element {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) return <CoreFallback />

  return (
    <Canvas
      camera={{ position: [0, 0.7, 6.0], fov: 44 }}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.90,
      }}
      style={{ background: 'transparent' }}
    >
      <PerformanceMonitor onDecline={() => {}} />
      <HadesCoreScene />
    </Canvas>
  )
}
