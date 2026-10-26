import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

type SubAgent = Exclude<AgentName, 'HADES'>

// Pentagon arrangement for 5 sub-agents (72° apart, starting top)
const ORBIT_POSITIONS: Record<SubAgent, [number, number, number]> = {
  CHARON:     [  0.00,  2.20,  0 ],  // 90° top
  PERSEPHONE: [  2.09,  0.68,  0 ],  // 18° upper-right
  MINOS:      [  1.29, -1.78,  0 ],  // 306° lower-right
  ELYSIUM:    [ -1.29, -1.78,  0 ],  // 234° lower-left
  TARTARUS:   [ -2.09,  0.68,  0 ],  // 162° upper-left
}

const AGENT_COLOR: Record<AgentName, string> = {
  HADES:      '#FFD700',
  CHARON:     '#00D4FF',
  PERSEPHONE: '#00CCEE',
  MINOS:      '#00BBDD',
  ELYSIUM:    '#00D4FF',
  TARTARUS:   '#0099CC',
}

// ─── CORE SPHERE (center) ────────────────────────────────────────────────────

function CoreSphere({ active, speed }: { active: boolean; speed: number }) {
  const coreRef = useRef<THREE.Mesh>(null)
  const g1Ref   = useRef<THREE.Mesh>(null)
  const g2Ref   = useRef<THREE.Mesh>(null)
  const g3Ref   = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (coreRef.current) {
      const s = active
        ? 1 + Math.sin(t * 4.5 * speed) * 0.12
        : 1 + Math.sin(t * 1.2) * 0.05
      coreRef.current.scale.setScalar(s)
    }
    if (g1Ref.current) {
      ;(g1Ref.current.material as THREE.MeshBasicMaterial).opacity = active
        ? 0.14 + Math.sin(t * 2.5) * 0.05
        : 0.05 + Math.sin(t * 0.8) * 0.02
    }
    if (g2Ref.current) {
      ;(g2Ref.current.material as THREE.MeshBasicMaterial).opacity = active
        ? 0.08 + Math.sin(t * 2.0 + 1) * 0.03
        : 0.03
    }
    if (g3Ref.current) {
      ;(g3Ref.current.material as THREE.MeshBasicMaterial).opacity = active
        ? 0.04 + Math.sin(t * 1.5 + 2) * 0.02
        : 0.012
    }
  })

  return (
    <group>
      {/* Solid metallic gold core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={active ? 1.4 : 0.6}
          metalness={0.85}
          roughness={0.12}
        />
      </mesh>
      {/* Glow shells — simulate bloom */}
      <mesh ref={g1Ref}>
        <sphereGeometry args={[0.30, 8, 8]} />
        <meshBasicMaterial color="#FFD700" transparent opacity={0.10} depthWrite={false} />
      </mesh>
      <mesh ref={g2Ref}>
        <sphereGeometry args={[0.52, 8, 8]} />
        <meshBasicMaterial color="#FFB800" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <mesh ref={g3Ref}>
        <sphereGeometry args={[0.80, 8, 8]} />
        <meshBasicMaterial color="#FF8800" transparent opacity={0.025} depthWrite={false} />
      </mesh>
      <pointLight color="#FFD700" intensity={active ? 4.0 : 1.8} distance={5.5} decay={2} />
    </group>
  )
}

// ─── SACRED GEOMETRY (inner crystal layers) ──────────────────────────────────

function SacredGeometry({ active, speed }: { active: boolean; speed: number }) {
  const icosaRef  = useRef<THREE.Mesh>(null)
  const octaRef   = useRef<THREE.Mesh>(null)
  const dodecaRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed
    if (icosaRef.current) {
      icosaRef.current.rotation.y = t * 0.18
      icosaRef.current.rotation.x = Math.sin(t * 0.07) * 0.20
    }
    if (octaRef.current) {
      octaRef.current.rotation.y = -t * 0.30
      octaRef.current.rotation.z =  t * 0.14
    }
    if (dodecaRef.current) {
      dodecaRef.current.rotation.x =  t * 0.10
      dodecaRef.current.rotation.y = -t * 0.08
    }
  })

  return (
    <group>
      {/* Outer icosahedron — gold */}
      <mesh ref={icosaRef}>
        <icosahedronGeometry args={[0.64, 1]} />
        <meshBasicMaterial color="#FFD700" wireframe transparent opacity={active ? 0.55 : 0.26} depthWrite={false} />
      </mesh>
      {/* Middle octahedron — brighter gold */}
      <mesh ref={octaRef}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color="#FFE060" wireframe transparent opacity={active ? 0.72 : 0.42} depthWrite={false} />
      </mesh>
      {/* Inner dodecahedron — subtle */}
      <mesh ref={dodecaRef}>
        <dodecahedronGeometry args={[0.27, 0]} />
        <meshBasicMaterial color="#FFA000" wireframe transparent opacity={active ? 0.42 : 0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── ORBIT RINGS (5 rings) ───────────────────────────────────────────────────

interface RingCfg {
  radius: number; tube: number
  tiltX: number; tiltZ: number
  color: string; opacity: number; baseSpeed: number
}

const RINGS: RingCfg[] = [
  { radius: 0.88, tube: 0.024, tiltX: 0,    tiltZ: 0,    color: '#FFD700', opacity: 0.70, baseSpeed:  0.38 },
  { radius: 1.18, tube: 0.018, tiltX: 1.05, tiltZ: 0,    color: '#00D4FF', opacity: 0.52, baseSpeed: -0.24 },
  { radius: 1.50, tube: 0.015, tiltX: 0,    tiltZ: 0.80, color: '#00AAEE', opacity: 0.36, baseSpeed:  0.15 },
  { radius: 1.82, tube: 0.011, tiltX: 0.55, tiltZ: 0.55, color: '#0088CC', opacity: 0.22, baseSpeed: -0.09 },
  { radius: 2.15, tube: 0.007, tiltX: 1.50, tiltZ: 0.30, color: '#006688', opacity: 0.14, baseSpeed:  0.05 },
]

function OrbitRing({ cfg, speedMult }: { cfg: RingCfg; speedMult: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * cfg.baseSpeed * speedMult
  })
  return (
    <mesh ref={ref} rotation={[cfg.tiltX, 0, cfg.tiltZ]}>
      <torusGeometry args={[cfg.radius, cfg.tube, 4, 88]} />
      <meshBasicMaterial color={cfg.color} transparent opacity={cfg.opacity} depthWrite={false} />
    </mesh>
  )
}

// ─── ENERGY FIELD (outer structure) ──────────────────────────────────────────

function EnergyField({ active, alert }: { active: boolean; alert: boolean }) {
  const ref1 = useRef<THREE.Mesh>(null)
  const ref2 = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref1.current) {
      ref1.current.rotation.x = t * 0.022
      ref1.current.rotation.z = t * 0.016
    }
    if (ref2.current) {
      ref2.current.rotation.x = -t * 0.012
      ref2.current.rotation.y =  t * 0.018
    }
  })

  const col1 = alert ? '#FF3366' : active ? '#00D4FF' : '#223355'
  const op1  = alert ? 0.10 : active ? 0.055 : 0.020
  const op2  = active ? 0.028 : 0.008

  return (
    <>
      <mesh ref={ref1}>
        <icosahedronGeometry args={[2.35, 1]} />
        <meshBasicMaterial color={col1} wireframe transparent opacity={op1} depthWrite={false} />
      </mesh>
      <mesh ref={ref2}>
        <icosahedronGeometry args={[2.65, 1]} />
        <meshBasicMaterial color={active ? '#004466' : '#0A1020'} wireframe transparent opacity={op2} depthWrite={false} />
      </mesh>
    </>
  )
}

// ─── HALO RING (outermost presence) ──────────────────────────────────────────

function HaloRing() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.016
  })
  return (
    <mesh ref={ref} rotation={[Math.PI / 5.5, 0, 0]}>
      <torusGeometry args={[3.25, 0.006, 3, 140]} />
      <meshBasicMaterial color="#00D4FF" transparent opacity={0.09} depthWrite={false} />
    </mesh>
  )
}

// ─── SCAN LINE (active only) ──────────────────────────────────────────────────

function ScanLine({ active }: { active: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || !active) return
    const t = clock.getElapsedTime()
    ref.current.rotation.y = t * 0.75
    ref.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.25) * 0.18
  })
  return (
    <mesh ref={ref} visible={active} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2.05, 0.004, 3, 90]} />
      <meshBasicMaterial color="#00D4FF" transparent opacity={0.18} depthWrite={false} />
    </mesh>
  )
}

// ─── PULSE WAVE (NEAR event) ──────────────────────────────────────────────────

function PulseWave({ trigger }: { trigger: number }) {
  const meshRef    = useRef<THREE.Mesh>(null)
  const startRef   = useRef<number | null>(null)
  const prevTrigger = useRef(trigger)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshBasicMaterial
    // Detect new trigger
    if (prevTrigger.current !== trigger) {
      prevTrigger.current = trigger
      startRef.current = clock.getElapsedTime()
    }
    if (startRef.current !== null) {
      const elapsed  = clock.getElapsedTime() - startRef.current
      const duration = 1.8
      if (elapsed < duration) {
        const p = elapsed / duration
        meshRef.current.scale.setScalar(0.4 + p * 3.6)
        mat.opacity = (1 - p) * 0.28
      } else {
        startRef.current = null
        meshRef.current.scale.setScalar(0.01)
        mat.opacity = 0
      }
    } else {
      mat.opacity = 0
    }
  })

  return (
    <mesh ref={meshRef} scale={0.01}>
      <sphereGeometry args={[1, 14, 14]} />
      <meshBasicMaterial color="#00D4FF" transparent opacity={0} depthWrite={false} wireframe />
    </mesh>
  )
}

// ─── PARTICLE CLOUD ───────────────────────────────────────────────────────────

function ParticleCloud() {
  const outerRef = useRef<THREE.Points>(null)
  const innerRef = useRef<THREE.Points>(null)

  const outerPositions = useMemo(() => {
    const n = 180
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 1.9 + Math.random() * 1.2
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  const innerPositions = useMemo(() => {
    const n = 50
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 0.88 + Math.random() * 0.55
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (outerRef.current) outerRef.current.rotation.y = clock.getElapsedTime() * 0.042
    if (innerRef.current) innerRef.current.rotation.y = -clock.getElapsedTime() * 0.065
  })

  return (
    <>
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={outerPositions} count={outerPositions.length / 3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#00D4FF" size={0.026} transparent opacity={0.38} sizeAttenuation depthWrite={false} />
      </points>
      <points ref={innerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={innerPositions} count={innerPositions.length / 3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#FFD700" size={0.048} transparent opacity={0.52} sizeAttenuation depthWrite={false} />
      </points>
    </>
  )
}

// ─── AGENT NODES ─────────────────────────────────────────────────────────────

function AgentNode({ name, position }: { name: SubAgent; position: [number, number, number] }) {
  const ref   = useRef<THREE.Mesh>(null)
  const agent = useHadesStore(s => s.agents[name])
  const active  = agent?.status !== 'IDLE'
  const isError = agent?.status === 'ERROR'
  const isWait  = agent?.status === 'WAITING'
  const hex     = isError ? '#FF3366' : isWait ? '#FFB800' : AGENT_COLOR[name]
  const color   = new THREE.Color(hex)

  useFrame(({ clock }) => {
    if (!ref.current || !active) return
    ref.current.rotation.y = clock.getElapsedTime() * 2.2
    ref.current.rotation.x = clock.getElapsedTime() * 1.1
  })

  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[active ? 0.155 : 0.11, 10, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 0.90 : 0.08}
          metalness={0.35}
          roughness={0.55}
        />
      </mesh>
      {/* Orbital ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.014, 4, 32]} />
        <meshBasicMaterial color={hex} transparent opacity={active ? 0.68 : 0.14} depthWrite={false} />
      </mesh>
      {active && (
        <>
          <mesh>
            <sphereGeometry args={[0.30, 8, 8]} />
            <meshBasicMaterial color={hex} transparent opacity={0.10} depthWrite={false} />
          </mesh>
          <pointLight color={hex} intensity={0.8} distance={1.6} decay={2} />
        </>
      )}
    </group>
  )
}

// ─── CONNECTION LINES ────────────────────────────────────────────────────────

function ConnectionLines() {
  const agents = useHadesStore(s => s.agents)
  const center: [number, number, number] = [0, 0, 0]
  return (
    <>
      {(Object.entries(ORBIT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => {
        const a      = agents[name]
        const active = a?.status !== 'IDLE'
        return (
          <Line
            key={name}
            points={[center, pos]}
            color={active ? AGENT_COLOR[name] : '#1A1A2E'}
            lineWidth={active ? 1.6 : 0.45}
            opacity={active ? 0.82 : 0.18}
            transparent
            dashed={!active}
            dashSize={0.14}
            gapSize={0.14}
          />
        )
      })}
    </>
  )
}

// ─── MAIN CANVAS ─────────────────────────────────────────────────────────────

export default function HolographicCore3D() {
  const agents       = useHadesStore(s => s.agents)
  const nearTxs      = useHadesStore(s => s.nearTxs)
  const auditRecords = useHadesStore(s => s.auditRecords)

  const anyActive    = Object.values(agents).some(a => a.status !== 'IDLE')
  const hasAlert     = Object.values(agents).some(a => a.status === 'ERROR')
                     || auditRecords.some(r => r.guardDecision === 'DENY')
  const speedMult    = anyActive ? 2.4 : 1.0
  const nearTxCount  = nearTxs.length

  return (
    <Canvas
      camera={{ position: [0, 0, 6.2], fov: 47 }}
      gl={{
        antialias:            true,
        alpha:                true,
        toneMapping:          THREE.ACESFilmicToneMapping,
        toneMappingExposure:  1.25,
      }}
      style={{ background: 'transparent' }}
    >
      <PerformanceMonitor onDecline={() => {}} />

      {/* Scene lights */}
      <ambientLight intensity={0.10} color="#1A2244" />
      <pointLight position={[0,  5,  3]}  color="#FFD700" intensity={1.8} decay={2} />
      <pointLight position={[-3, -2,  2]} color="#00D4FF" intensity={1.1} decay={2} />
      <pointLight position={[3,   2, -2]} color="#003388" intensity={0.7} decay={2} />
      {anyActive && <pointLight position={[0, -3, 2]} color="#00AAFF" intensity={0.8} decay={2} />}
      {hasAlert  && <pointLight position={[0,  0, 3]} color="#FF3366" intensity={0.6} decay={2} />}

      {/* Back → front rendering order */}
      <HaloRing />
      <EnergyField active={anyActive} alert={hasAlert} />
      <ParticleCloud />
      <ScanLine active={anyActive} />

      {RINGS.map((cfg, i) => (
        <OrbitRing key={i} cfg={cfg} speedMult={speedMult} />
      ))}

      <SacredGeometry active={anyActive} speed={speedMult} />
      <CoreSphere     active={anyActive} speed={speedMult} />

      <ConnectionLines />
      <PulseWave trigger={nearTxCount} />

      {(Object.entries(ORBIT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => (
        <AgentNode key={name} name={name} position={pos} />
      ))}
    </Canvas>
  )
}
