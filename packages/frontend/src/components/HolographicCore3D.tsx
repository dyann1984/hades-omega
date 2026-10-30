import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

export type SubAgent = Exclude<AgentName, 'HADES'>

// Six operational agents — equal 60° apart, each on a distinct 3D orbital plane.
const ORBIT_RADIUS = 2.20
const ORBIT_ANGLES: Record<SubAgent, number> = {
  CHARON:     Math.PI / 2,
  PERSEPHONE: Math.PI / 2 - (Math.PI * 2) / 6,
  MINOS:      Math.PI / 2 - (Math.PI * 4) / 6,
  CERBERUS:   Math.PI / 2 - (Math.PI * 6) / 6,
  ELYSIUM:    Math.PI / 2 - (Math.PI * 8) / 6,
  TARTARUS:   Math.PI / 2 - (Math.PI * 10) / 6,
}

const ORBIT_POSITIONS: Record<SubAgent, [number, number, number]> = Object.fromEntries(
  (Object.entries(ORBIT_ANGLES) as [SubAgent, number][]).map(([name, a]) => [
    name,
    [ORBIT_RADIUS * Math.cos(a), ORBIT_RADIUS * Math.sin(a), 0] as [number, number, number],
  ])
) as Record<SubAgent, [number, number, number]>

const AGENT_COLOR: Record<AgentName, string> = {
  HADES:      '#FFD700',
  CHARON:     '#00D4FF',
  PERSEPHONE: '#00CCEE',
  MINOS:      '#00BBDD',
  CERBERUS:   '#FFB800',
  ELYSIUM:    '#00D4FF',
  TARTARUS:   '#0099CC',
}

const AGENT_SYMBOL: Record<SubAgent, string> = {
  CHARON:     '⚡',
  PERSEPHONE: '◈',
  MINOS:      '⚖',
  CERBERUS:   '◉',
  ELYSIUM:    '◎',
  TARTARUS:   '▲',
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

// ─── SACRED GEOMETRY ─────────────────────────────────────────────────────────

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
    <group scale={1.38}>
      <mesh ref={icosaRef}>
        <icosahedronGeometry args={[0.64, 1]} />
        <meshBasicMaterial color="#FFD700" wireframe transparent opacity={active ? 0.55 : 0.26} depthWrite={false} />
      </mesh>
      <mesh ref={octaRef}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color="#FFE060" wireframe transparent opacity={active ? 0.72 : 0.42} depthWrite={false} />
      </mesh>
      <mesh ref={dodecaRef}>
        <dodecahedronGeometry args={[0.27, 0]} />
        <meshBasicMaterial color="#FFA000" wireframe transparent opacity={active ? 0.42 : 0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── ORBIT RINGS ─────────────────────────────────────────────────────────────

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

// ─── ENERGY FIELD ────────────────────────────────────────────────────────────

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

  return (
    <>
      <mesh ref={ref1}>
        <icosahedronGeometry args={[2.35, 1]} />
        <meshBasicMaterial
          color={alert ? '#FF3366' : active ? '#00D4FF' : '#223355'}
          wireframe transparent
          opacity={alert ? 0.10 : active ? 0.055 : 0.020}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ref2}>
        <icosahedronGeometry args={[2.65, 1]} />
        <meshBasicMaterial
          color={active ? '#004466' : '#0A1020'}
          wireframe transparent
          opacity={active ? 0.028 : 0.008}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

// ─── HALO RING ───────────────────────────────────────────────────────────────

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

// ─── SCAN LINE ───────────────────────────────────────────────────────────────

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

// ─── PULSE WAVE ──────────────────────────────────────────────────────────────

function PulseWave({ trigger }: { trigger: number }) {
  const meshRef     = useRef<THREE.Mesh>(null)
  const startRef    = useRef<number | null>(null)
  const prevTrigger = useRef(trigger)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshBasicMaterial
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

// ─── PARTICLE CLOUD ──────────────────────────────────────────────────────────

function ParticleCloud() {
  const outerRef = useRef<THREE.Points>(null)
  const innerRef = useRef<THREE.Points>(null)

  const outerPositions = useMemo(() => {
    const n = 180; const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 1.9 + Math.random() * 1.2
      arr[i*3] = r*Math.sin(phi)*Math.cos(theta)
      arr[i*3+1] = r*Math.sin(phi)*Math.sin(theta)
      arr[i*3+2] = r*Math.cos(phi)
    }
    return arr
  }, [])

  const innerPositions = useMemo(() => {
    const n = 50; const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 0.88 + Math.random() * 0.55
      arr[i*3] = r*Math.sin(phi)*Math.cos(theta)
      arr[i*3+1] = r*Math.sin(phi)*Math.sin(theta)
      arr[i*3+2] = r*Math.cos(phi)
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (outerRef.current) outerRef.current.rotation.y =  clock.getElapsedTime() * 0.042
    if (innerRef.current) innerRef.current.rotation.y = -clock.getElapsedTime() * 0.065
  })

  return (
    <>
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={outerPositions} count={outerPositions.length/3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#00D4FF" size={0.026} transparent opacity={0.38} sizeAttenuation depthWrite={false} />
      </points>
      <points ref={innerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={innerPositions} count={innerPositions.length/3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#FFD700" size={0.048} transparent opacity={0.52} sizeAttenuation depthWrite={false} />
      </points>
    </>
  )
}

// ─── AGENT NODE ──────────────────────────────────────────────────────────────

interface AgentNodeProps {
  name:     SubAgent
  position: [number, number, number]
  selected: boolean
  onSelect: () => void
}

function AgentNode({ name, position, selected, onSelect }: AgentNodeProps) {
  const ref    = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const agent  = useHadesStore(s => s.agents[name])
  const active  = agent?.status !== 'IDLE'
  const isError = agent?.status === 'ERROR'
  const isWait  = agent?.status === 'WAITING'
  const hex     = isError ? '#FF3366' : isWait ? '#FFB800' : AGENT_COLOR[name]
  const color   = new THREE.Color(hex)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current && active) {
      ref.current.rotation.y = t * 2.2
      ref.current.rotation.x = t * 1.1
    }
    if (ringRef.current) {
      const op = selected ? 0.85 : active ? 0.68 : 0.14
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = op
      ringRef.current.rotation.z = t * 1.2
    }
  })

  return (
    <group position={position}>
      {/* Clickable main sphere */}
      <mesh
        ref={ref}
        onClick={e => { e.stopPropagation(); onSelect() }}
        onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
        onPointerOut={e => { e.stopPropagation(); document.body.style.cursor = 'default' }}
      >
        <octahedronGeometry args={[active ? 0.12 : 0.085, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.4 : active ? 0.90 : 0.08}
          metalness={0.35}
          roughness={0.55}
        />
      </mesh>
      {/* Selection ring */}
      {selected && <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[selected ? 0.34 : 0.26, 0.014, 4, 32]} />
        <meshBasicMaterial color={hex} transparent opacity={0.14} depthWrite={false} />
      </mesh>}
      {/* Active glow */}
      {(active || selected) && (
        <>
          <mesh>
            <sphereGeometry args={[selected ? 0.38 : 0.30, 8, 8]} />
            <meshBasicMaterial color={hex} transparent opacity={selected ? 0.18 : 0.10} depthWrite={false} />
          </mesh>
          <pointLight color={hex} intensity={selected ? 1.4 : 0.8} distance={1.6} decay={2} />
        </>
      )}
      {/* Label indicator: outer glow ring when selected */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.50, 0.004, 3, 40]} />
          <meshBasicMaterial color={hex} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

// ─── ORBITAL SYSTEM (agents + connections, rotates together for 3D depth) ────

interface OrbitalSystemProps {
  speedMult:     number
  selectedAgent: SubAgent | null
  onAgentSelect: (name: SubAgent) => void
}

function OrbitalSystem({ speedMult, selectedAgent, onAgentSelect }: OrbitalSystemProps) {
  const groupRef  = useRef<THREE.Group>(null)
  const CENTER: [number, number, number] = [0, 0, 0]

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Slow orbital rotation — full lap ~50s at rest, ~21s when active
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.125 * speedMult
    }
  })

  return (
    // Tilt group ~25° around X for true 3D orbital depth
    <group ref={groupRef} rotation={[0.44, 0, 0.06]}>
      {/* Connection lines — inside group so they rotate with agents */}
      {(Object.entries(ORBIT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => {
        const active = false // A visible agent status does not prove communication.
        return (
          <Line
            key={name}
            points={[CENTER, pos]}
            color={selectedAgent === name ? AGENT_COLOR[name] : active ? AGENT_COLOR[name] : '#1A1A2E'}
            lineWidth={selectedAgent === name ? 2.2 : active ? 1.6 : 0.45}
            opacity={selectedAgent === name ? 1.0 : active ? 0.82 : 0.18}
            transparent
            dashed={!active && selectedAgent !== name}
            dashSize={0.14}
            gapSize={0.14}
          />
        )
      })}
      {/* Agent nodes */}
      {(Object.entries(ORBIT_POSITIONS) as [SubAgent, [number, number, number]][]).map(([name, pos]) => (
        <AgentNode
          key={name}
          name={name}
          position={pos}
          selected={selectedAgent === name}
          onSelect={() => onAgentSelect(name)}
        />
      ))}
    </group>
  )
}

// ─── AGENT LABEL OVERLAY (HTML-rendered, outside Canvas) ─────────────────────

export interface AgentInfo {
  name:     SubAgent
  symbol:   string
  color:    string
}

export function getAgentInfo(name: SubAgent): AgentInfo {
  return { name, symbol: AGENT_SYMBOL[name], color: AGENT_COLOR[name] }
}

// ─── MAIN CANVAS ─────────────────────────────────────────────────────────────

interface Props {
  selectedAgent?: SubAgent | null
  onAgentSelect?: (name: SubAgent) => void
  paused?: boolean
  missionActive?: boolean
  lowPower?: boolean
  resetSignal?: number
}

function ViewControls({ resetSignal }: { resetSignal: number }) {
  const ref = useRef<any>(null)
  useEffect(() => { ref.current?.reset() }, [resetSignal])
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enableZoom
      enablePan
      minDistance={3}
      maxDistance={9}
      rotateSpeed={0.7}
    />
  )
}

export default function HolographicCore3D({ selectedAgent = null, onAgentSelect = () => {}, paused = false, missionActive = false, lowPower = false, resetSignal = 0 }: Props) {
  const agents       = useHadesStore(s => s.agents)

  const anyActive   = missionActive || Object.values(agents).some(a => a.status !== 'IDLE')
  const hasAlert    = Object.values(agents).some(a => a.status === 'ERROR')
  const speedMult   = paused ? 0 : anyActive ? 2.4 : 1.0

  return (
    <Canvas
      camera={{ position: [0, 0, 5.8], fov: 47 }}
      dpr={lowPower ? 1 : [1, 1.5]}
      frameloop={paused ? 'demand' : 'always'}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.25,
      }}
      style={{ background: 'transparent', touchAction: 'pan-y' }}
    >
      <PerformanceMonitor onDecline={() => {}} />
      <ViewControls resetSignal={resetSignal} />

      <ambientLight intensity={0.10} color="#1A2244" />
      <pointLight position={[0,  5,  3]}  color="#FFD700" intensity={1.8} decay={2} />
      <pointLight position={[-3, -2,  2]} color="#00D4FF" intensity={1.1} decay={2} />
      <pointLight position={[3,   2, -2]} color="#003388" intensity={0.7} decay={2} />
      {anyActive && <pointLight position={[0, -3, 2]} color="#00AAFF" intensity={0.8} decay={2} />}
      {hasAlert  && <pointLight position={[0,  0, 3]} color="#FF3366" intensity={0.6} decay={2} />}

      <HaloRing />
      <EnergyField active={anyActive} alert={hasAlert} />
      {!lowPower && <ParticleCloud />}
      <ScanLine active={anyActive} />

      {RINGS.map((cfg, i) => (
        <OrbitRing key={i} cfg={cfg} speedMult={speedMult} />
      ))}

      <SacredGeometry active={anyActive} speed={speedMult} />
      <CoreSphere     active={anyActive} speed={speedMult} />

      {/* Orbital system with 3D tilt + slow rotation */}
      <OrbitalSystem
        speedMult={speedMult}
        selectedAgent={selectedAgent}
        onAgentSelect={onAgentSelect}
      />

      <PulseWave trigger={0} />
    </Canvas>
  )
}

