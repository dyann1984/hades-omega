/**
 * HadesCore — SOVEREIGN NEURAL INTELLIGENCE CORE v5
 *
 * v5 visual fixes over v4:
 * - Crystal bodies: metalness 0.94→0.72, color 0x040810→0x0A1830, emissive baseline 0.18→0.38
 *   → surfaces now pick up colored point lights and show solid 3D faces, not wireframes
 * - Platform rings: radii [1.4,2.6,4.0]→[0.9,1.7,2.6], opacity 0.28-0.46→0.06-0.14
 *   → rings no longer dominate through Bloom
 * - CoreParticles re-added: 3 rotation groups × 60 pts each; each group = ONE matrix update/frame
 * - Hemisphere light added: gives crystal faces blue/deep ambient gradient
 * - Agent cluster size +20%: heightBase 0.18→0.22, wScale 0.100→0.120
 * - Bloom threshold 0.58→0.52: crystal body emissive now contributes to glow
 */

import { useRef, useMemo, useState, useCallback, CSSProperties } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, AdaptiveDpr } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ─── Types ───────────────────────────────────────────────────────────────────

export type HadesCoreState =
  | 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ALERT' | 'COMPLETED'

interface SP { intensity: number; alertFactor: number; speed: number; bloom: number }

const STATES: Record<HadesCoreState, SP> = {
  IDLE:      { intensity: 0.44, alertFactor: 0,   speed: 0.65, bloom: 0.52 },
  THINKING:  { intensity: 0.72, alertFactor: 0,   speed: 1.10, bloom: 0.68 },
  EXECUTING: { intensity: 1.00, alertFactor: 0,   speed: 1.55, bloom: 0.88 },
  WAITING:   { intensity: 0.26, alertFactor: 0,   speed: 0.40, bloom: 0.28 },
  ALERT:     { intensity: 0.92, alertFactor: 1.0, speed: 1.40, bloom: 0.98 },
  COMPLETED: { intensity: 0.65, alertFactor: 0,   speed: 0.85, bloom: 0.58 },
}

// ─── Shared Geometries (module-level) ─────────────────────────────────────────

const OCT_GEO   = new THREE.OctahedronGeometry(1, 0)
const OCT_EDGES = new THREE.EdgesGeometry(OCT_GEO, 5)

// ─── Shard Definitions ───────────────────────────────────────────────────────

interface ShardDef { r: number; a: number; hs: number; t: number; roll: number }

const CORE_SHARDS: ShardDef[] = [
  { r:0.00, a:  0, hs:2.80, t: 0, roll:  0 },
  { r:0.32, a: 22, hs:2.25, t: 6, roll: 12 },
  { r:0.30, a: 88, hs:1.90, t: 7, roll: -8 },
  { r:0.34, a:152, hs:2.15, t: 5, roll: 15 },
  { r:0.28, a:218, hs:1.75, t: 8, roll: -5 },
  { r:0.33, a:302, hs:2.00, t: 6, roll: 10 },
  { r:0.62, a: 42, hs:1.30, t:14, roll: 20 },
  { r:0.58, a:108, hs:1.48, t:13, roll:-15 },
  { r:0.64, a:174, hs:1.22, t:16, roll:  8 },
  { r:0.60, a:248, hs:1.38, t:15, roll:-20 },
  { r:0.55, a:316, hs:1.18, t:14, roll: 12 },
  { r:0.56, a: -6, hs:1.28, t:15, roll:-10 },
]

const SHARDS_TALL: ShardDef[] = [
  { r:0.00, a:  0, hs:1.80, t: 0, roll:  0 },
  { r:0.22, a: 55, hs:1.20, t:10, roll: 15 },
  { r:0.20, a:175, hs:1.35, t:12, roll: -8 },
  { r:0.22, a:295, hs:1.10, t:10, roll: 12 },
]

const SHARDS_PRISM: ShardDef[] = [
  { r:0.00, a:  0, hs:1.65, t: 0, roll:  5 },
  { r:0.18, a: 90, hs:1.18, t:12, roll:-12 },
  { r:0.18, a:270, hs:1.25, t:12, roll: 10 },
]

const SHARDS_ANGULAR: ShardDef[] = [
  { r:0.00, a:  0, hs:1.72, t: 0, roll:  0 },
  { r:0.20, a: 35, hs:1.05, t: 8, roll: 20 },
  { r:0.20, a:155, hs:1.32, t:10, roll:-15 },
  { r:0.22, a:248, hs:0.98, t: 9, roll: 10 },
]

const toRad = (d: number) => d * Math.PI / 180

// ─── Agent Configs ────────────────────────────────────────────────────────────

interface AgentCfg {
  id:         string
  name:       string
  role:       string
  angle:      number
  orbitR:     number
  orbitSpd:   number   // very slow: 0.025-0.060 rad/s
  orbInc:     number   // inclination ° — tilted 3D orbital planes, not flat solar-system
  orbLng:     number   // longitude of ascending node ° — spreads planes 60° apart
  shards:     ShardDef[]
  accentHex:  number
  emissiveHex:number
  status:     'active' | 'standby' | 'alert'
}

export const AGENTS: AgentCfg[] = [
  { id:'cerberus',   name:'CERBERUS',   role:'Seguridad & Políticas',       angle:  0, orbitR:2.85, orbitSpd:0.055, orbInc:15, orbLng:  0, shards:SHARDS_PRISM,   accentHex:0xCC2200, emissiveHex:0x330800, status:'active'  },
  { id:'minos',      name:'MINOS',      role:'Validación & Aprobaciones',   angle: 60, orbitR:2.75, orbitSpd:0.045, orbInc:20, orbLng: 60, shards:SHARDS_PRISM,   accentHex:0xB8900A, emissiveHex:0x442200, status:'active'  },
  { id:'persephone', name:'PERSEPHONE', role:'Finanzas & Presupuesto',      angle:120, orbitR:2.95, orbitSpd:0.040, orbInc:25, orbLng:120, shards:SHARDS_TALL,    accentHex:0x00CCBB, emissiveHex:0x004444, status:'active'  },
  { id:'charon',     name:'CHARON',     role:'Compras & Proveedores',       angle:180, orbitR:2.70, orbitSpd:0.060, orbInc:12, orbLng:180, shards:SHARDS_ANGULAR, accentHex:0x1A9FBB, emissiveHex:0x003355, status:'active'  },
  { id:'elysium',    name:'ELYSIUM',    role:'Planificación & Resultados',  angle:240, orbitR:2.80, orbitSpd:0.035, orbInc:22, orbLng:240, shards:SHARDS_TALL,    accentHex:0x88AADD, emissiveHex:0x102040, status:'active'  },
  { id:'tartarus',   name:'TARTARUS',   role:'Anomalías & Contención',      angle:300, orbitR:3.05, orbitSpd:0.025, orbInc:18, orbLng:300, shards:SHARDS_ANGULAR, accentHex:0x8833BB, emissiveHex:0x1A0033, status:'alert'   },
]

// ─── Crystal Shard ────────────────────────────────────────────────────────────
// Pure geometry — NO useFrame. Accepts shared materials from parent cluster.
// All shards in a cluster share one bodyMat + one edgeMat → single update point.

interface ShardProps {
  def:      ShardDef
  heightBase: number
  wScale:   number
  dScale:   number
  bodyMat:  THREE.MeshStandardMaterial
  edgeMat:  THREE.LineBasicMaterial
}

function CrystalShard({ def, heightBase, wScale, dScale, bodyMat, edgeMat }: ShardProps) {
  const H      = def.hs * heightBase
  const scaleY = H / 2
  const posY   = H / 2
  const phi    = toRad(def.a)

  return (
    <group rotation-y={phi}>
      <group position-x={def.r} rotation-z={-toRad(def.t)} rotation-x={toRad(def.roll)}>
        <mesh geometry={OCT_GEO} position-y={posY} scale={[wScale, scaleY, dScale]}>
          <primitive object={bodyMat} attach="material" />
        </mesh>
        <lineSegments geometry={OCT_EDGES} position-y={posY} scale={[wScale, scaleY, dScale]}>
          <primitive object={edgeMat} attach="material" />
        </lineSegments>
      </group>
    </group>
  )
}

// ─── Crystal Cluster ─────────────────────────────────────────────────────────
// Creates shared materials; one useFrame updates all shards at once.

interface ClusterProps {
  shards:      ShardDef[]
  heightBase:  number
  wScale:      number
  dScale:      number
  coreRadius:  number
  intensity:   number
  alertFactor: number
  speed:       number
  paused:      boolean
  accentHex:   number
  emissiveHex: number
}

function CrystalCluster({
  shards, heightBase, wScale, dScale, coreRadius,
  intensity, alertFactor, speed, paused, accentHex, emissiveHex,
}: ClusterProps) {
  // Shared materials — one update drives all shards
  // metalness 0.72 (was 0.94): allows diffuse from point lights → visible crystal faces
  // color 0x0A1830: slightly lighter base picks up blue/gold lighting
  // emissiveIntensity 0.38: self-glow visible in dark areas
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:              0x0A1830,
    emissive:           emissiveHex,
    emissiveIntensity:  0.38,
    metalness:          0.72,
    roughness:          0.18,
  }), [emissiveHex])

  const edgeMat = useMemo(() => new THREE.LineBasicMaterial({
    color:       accentHex,
    transparent: true,
    opacity:     0.82,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [accentHex])

  const accentColor  = useMemo(() => new THREE.Color(accentHex), [accentHex])
  const coreRef      = useRef<THREE.Mesh>(null)
  const coreMatRef   = useRef<THREE.MeshStandardMaterial>(null)
  const coreLightRef = useRef<THREE.PointLight>(null)

  // Single useFrame for ALL shard materials + core sphere
  useFrame(({ clock }) => {
    if (paused) return
    const t    = clock.getElapsedTime() * speed
    const beat = 0.60 + 0.38 * Math.sin(t * 1.15) * intensity

    // Edge glow modulation
    if (alertFactor > 0.1) {
      edgeMat.color.setRGB(0.95, 0.42 * beat, 0.02)
    } else {
      edgeMat.color.setRGB(accentColor.r * beat, accentColor.g * beat, accentColor.b * beat)
    }
    edgeMat.opacity = 0.62 + 0.28 * beat

    bodyMat.emissiveIntensity = 0.32 + 0.22 * Math.sin(t * 0.75) * intensity

    // Core sphere
    if (coreRef.current) {
      coreRef.current.scale.setScalar(1.0 + 0.13 * Math.sin(t * 2.8) * intensity)
    }
    if (coreMatRef.current) {
      coreMatRef.current.emissiveIntensity = 3.2 + 1.8 * Math.sin(t * 2.2) * intensity
      coreMatRef.current.emissive.setHex(alertFactor > 0.1 ? 0xFF2200 : accentHex)
    }
    if (coreLightRef.current) {
      const li = (1.2 + 0.8 * Math.sin(t * 1.8)) * intensity
      coreLightRef.current.intensity = alertFactor > 0.1 ? li * 0.6 : li
      coreLightRef.current.color.setHex(alertFactor > 0.1 ? 0xFF3300 : accentHex)
    }
  })

  return (
    <group>
      {shards.map((def, i) => (
        <CrystalShard
          key={i}
          def={def}
          heightBase={heightBase}
          wScale={wScale}
          dScale={dScale}
          bodyMat={bodyMat}
          edgeMat={edgeMat}
        />
      ))}

      {/* Energy nucleus */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[coreRadius, 16, 16]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color={emissiveHex}
          emissive={accentHex}
          emissiveIntensity={3.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Inner hot-white kernel */}
      <mesh>
        <sphereGeometry args={[coreRadius * 0.50, 10, 10]} />
        <meshBasicMaterial
          color={0xCCEEFF}
          transparent
          opacity={0.90}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <pointLight
        ref={coreLightRef}
        color={accentHex}
        intensity={1.2}
        distance={coreRadius * 18}
        decay={2}
      />
    </group>
  )
}

// ─── Tech Platform ────────────────────────────────────────────────────────────

function TechPlatform({ intensity, paused }: { intensity: number; paused: boolean }) {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([])

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime()
    ringRefs.current.forEach((m, i) => {
      if (!m) return
      ;(m.material as THREE.MeshBasicMaterial).opacity =
        0.06 + 0.08 * Math.sin(t * 0.5 + i * 0.8) * intensity
    })
  })

  // Reduced radii and opacity — rings were dominating through Bloom
  const RING_RADII = [0.9, 1.7, 2.6]

  return (
    <group position-y={-0.11}>
      <mesh>
        <cylinderGeometry args={[4.6, 4.6, 0.11, 64, 1]} />
        <meshStandardMaterial color={0x04080E} metalness={0.92} roughness={0.10} />
      </mesh>
      <mesh position-y={0.056}>
        <cylinderGeometry args={[4.58, 4.58, 0.001, 64, 1]} />
        <meshStandardMaterial color={0x060C1A} metalness={1.0} roughness={0.04} transparent opacity={0.72} />
      </mesh>
      {RING_RADII.map((r, i) => (
        <mesh key={i} ref={el => { ringRefs.current[i] = el }} position-y={0.057} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[r, 0.016, 6, 72]} />
          <meshBasicMaterial color="#C89020" transparent opacity={0.06 + i * 0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      {/* Inner disc glow */}
      <mesh position-y={0.058} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.35, 48]} />
        <meshBasicMaterial color="#001A66" transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── Orbital Agent ────────────────────────────────────────────────────────────
// 3D Keplerian orbit: orbInc + orbLng give each agent a UNIQUE orbital plane.
// The 3D depth makes them read as satellite nodes, not planets on a flat diagram.

interface AgentProps {
  agent:       AgentCfg
  intensity:   number
  alertFactor: number
  speed:       number
  paused:      boolean
  isSelected:  boolean
  onSelect:    (id: string) => void
  groupRef:    React.MutableRefObject<THREE.Group | null>
}

function OrbitalAgent({ agent, intensity, alertFactor, speed, paused, isSelected, onSelect, groupRef }: AgentProps) {
  const isAlert = agent.status === 'alert' || (agent.id === 'tartarus' && alertFactor > 0.5)

  // Pre-computed constants for this agent's orbital plane (never change)
  const cosLng = Math.cos(toRad(agent.orbLng))
  const sinLng = Math.sin(toRad(agent.orbLng))
  const cosInc = Math.cos(toRad(agent.orbInc))
  const sinInc = Math.sin(toRad(agent.orbInc))

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const T   = clock.getElapsedTime() * (paused ? 0 : speed)
    const ang = toRad(agent.angle) + T * agent.orbitSpd
    const xo  = agent.orbitR * Math.cos(ang)
    const yo  = agent.orbitR * Math.sin(ang)

    groupRef.current.position.set(
      xo * cosLng - yo * cosInc * sinLng,
      yo * sinInc,
      xo * sinLng + yo * cosInc * cosLng,
    )
  })

  const statusColor = isAlert ? '#FF3333' : agent.status === 'standby' ? '#C9A84C' : '#00EE88'

  return (
    <group
      ref={groupRef as React.Ref<THREE.Group>}
      onClick={() => onSelect(agent.id)}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <CrystalCluster
        shards={agent.shards}
        heightBase={0.22}
        wScale={0.120}
        dScale={0.092}
        coreRadius={0.080}
        intensity={isAlert ? 0.9 : intensity}
        alertFactor={isAlert ? 1 : 0}
        speed={speed}
        paused={paused}
        accentHex={isAlert ? 0xFF3300 : agent.accentHex}
        emissiveHex={agent.emissiveHex}
      />

      {/* Station base ring — marks node as a fixed installation */}
      {isSelected && (
        <mesh position-y={-0.10} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[0.48, 0.016, 6, 48]} />
          <meshBasicMaterial color={agent.accentHex} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      <Html
        center
        distanceFactor={9}
        style={{ pointerEvents:'none', whiteSpace:'nowrap' }}
        position={[0, 0.76, 0]}
      >
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
          <div style={{
            fontSize:'9px', fontWeight:700, letterSpacing:'0.18em',
            color:'#D7EEFF', background:'rgba(2,4,14,0.82)',
            padding:'3px 8px', borderRadius:'2px', backdropFilter:'blur(6px)',
            fontFamily:'"Inter", system-ui, sans-serif',
          }}>
            {agent.name}
          </div>
          <div style={{ fontSize:'7px', letterSpacing:'0.08em', color:'rgba(215,238,255,0.50)', fontFamily:'"Inter", system-ui, sans-serif' }}>
            {agent.role}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <div style={{ width:'4px', height:'4px', borderRadius:'50%', background:statusColor, boxShadow:`0 0 5px ${statusColor}` }} />
            <span style={{ fontSize:'7px', color:statusColor, letterSpacing:'0.12em', fontFamily:'"Inter", system-ui, sans-serif' }}>
              {agent.status === 'alert' ? 'ALERTA' : agent.status === 'standby' ? 'ESPERA' : 'ACTIVO'}
            </span>
          </div>
        </div>
      </Html>
    </group>
  )
}

// ─── Neural Filaments ─────────────────────────────────────────────────────────
// One colored filament per agent + particle flow. Per-agent accent color.

const N_SEGS   = 38
const N_FLOW   = 14
const VEC_ZERO = new THREE.Vector3(0, 0, 0)

function quad(A: THREE.Vector3, B: THREE.Vector3, C: THREE.Vector3, t: number): THREE.Vector3 {
  const mt = 1 - t
  return new THREE.Vector3(
    mt*mt*A.x + 2*mt*t*B.x + t*t*C.x,
    mt*mt*A.y + 2*mt*t*B.y + t*t*C.y,
    mt*mt*A.z + 2*mt*t*B.z + t*t*C.z,
  )
}

interface FilamentProps {
  agentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>
  intensity:      number
  alertFactor:    number
  speed:          number
  paused:         boolean
  visible:        boolean
  selectedId:     string | null
}

function NeuralFilaments({ agentGroupRefs, intensity, alertFactor, speed, paused, visible, selectedId }: FilamentProps) {
  const { lineObjs, lineMats, flowObjs, flowGeos, flowMats, flowOffsets } = useMemo(() => {
    const makeGeo = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N_SEGS+1)*3), 3))
      return g
    }

    const lineMats = AGENTS.map(a => new THREE.LineBasicMaterial({
      color: a.accentHex, transparent: true, opacity: 0.20,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    const lineObjs = AGENTS.map((_, i) => new THREE.Line(makeGeo(), lineMats[i]))

    const flowGeos = AGENTS.map(() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLOW*3), 3))
      return g
    })
    const flowMats = AGENTS.map(a => new THREE.PointsMaterial({
      color: a.accentHex, size: 0.048, transparent: true, opacity: 0.90,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
    }))
    const flowObjs = AGENTS.map((_, i) => new THREE.Points(flowGeos[i], flowMats[i]))
    const flowOffsets = AGENTS.map(() => Array.from({ length: N_FLOW }, (_, j) => j / N_FLOW))

    return { lineObjs, lineMats, flowObjs, flowGeos, flowMats, flowOffsets }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(({ clock }) => {
    if (!visible || paused) return
    const T = clock.getElapsedTime() * speed

    AGENTS.forEach((agent, i) => {
      const grp = agentGroupRefs.current[i]
      if (!grp) return
      const aPos = grp.position.clone()
      const ctrl = new THREE.Vector3(aPos.x * 0.42, 0.55 + aPos.y * 0.28, aPos.z * 0.42)

      // Update line geometry
      const lineGeo = lineObjs[i].geometry as THREE.BufferGeometry
      const lArr    = lineGeo.attributes.position.array as Float32Array
      for (let s = 0; s <= N_SEGS; s++) {
        const pt = quad(VEC_ZERO, ctrl, aPos, s / N_SEGS)
        lArr[s*3]=pt.x; lArr[s*3+1]=pt.y; lArr[s*3+2]=pt.z
      }
      lineGeo.attributes.position.needsUpdate = true

      // Update colors
      const col = alertFactor > 0.5 ? 0xFF2200 : agent.accentHex
      lineMats[i].opacity = selectedId === agent.id ? 0.55 : 0.16 + intensity * 0.12
      lineMats[i].color.setHex(col)
      flowMats[i].color.setHex(alertFactor > 0.5 ? 0xFF3300 : agent.accentHex)

      // Update particle positions
      const fArr    = flowGeos[i].attributes.position.array as Float32Array
      const flowSpd = 0.10 + (i * 0.012)
      flowOffsets[i].forEach((off, j) => {
        const tv = (off + T * flowSpd) % 1
        const pt = quad(VEC_ZERO, ctrl, aPos, tv)
        fArr[j*3]=pt.x; fArr[j*3+1]=pt.y; fArr[j*3+2]=pt.z
      })
      flowGeos[i].attributes.position.needsUpdate = true
    })
  })

  if (!visible) return null

  return (
    <group>
      {AGENTS.map((_, i) => (
        <group key={AGENTS[i].id}>
          <primitive object={lineObjs[i]} />
          <primitive object={flowObjs[i]} />
        </group>
      ))}
    </group>
  )
}

// ─── Core Particles ───────────────────────────────────────────────────────────
// 3 rotation groups × 60 particles each — each group = ONE matrix multiply/frame.
// O(3) per frame (rotate group transforms), not O(180) per particle.

const CP_INNER_R = 0.52   // tight blue-white ring
const CP_MID_R   = 0.85   // mid cyan particles
const CP_OUTER_R = 1.28   // sparse gold dust

function makeSphereRingPositions(count: number, radius: number, spread: number): Float32Array {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 + Math.random() * 0.3
    const phi   = (Math.random() - 0.5) * spread
    arr[i*3]   = radius * Math.cos(phi) * Math.cos(theta)
    arr[i*3+1] = radius * Math.sin(phi)
    arr[i*3+2] = radius * Math.cos(phi) * Math.sin(theta)
  }
  return arr
}

interface CPProps { intensity: number; paused: boolean; speed: number }

function CoreParticles({ intensity, paused, speed }: CPProps) {
  const innerRef = useRef<THREE.Group>(null)
  const midRef   = useRef<THREE.Group>(null)
  const outerRef = useRef<THREE.Group>(null)

  const { innerGeo, midGeo, outerGeo, innerMat, midMat, outerMat } = useMemo(() => {
    const inner = new Float32Array(60 * 3)
    const mid   = new Float32Array(60 * 3)
    const outer = new Float32Array(60 * 3)

    const ig = makeSphereRingPositions(60, CP_INNER_R, 0.55)
    const mg = makeSphereRingPositions(60, CP_MID_R,   0.82)
    const og = makeSphereRingPositions(60, CP_OUTER_R, 1.10)
    ig.forEach((v, i) => inner[i] = v)
    mg.forEach((v, i) => mid[i]   = v)
    og.forEach((v, i) => outer[i] = v)

    const mkGeo = (pos: Float32Array) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      return g
    }
    const innerGeo = mkGeo(inner)
    const midGeo   = mkGeo(mid)
    const outerGeo = mkGeo(outer)

    const innerMat = new THREE.PointsMaterial({ color: 0x88CCFF, size: 0.020, transparent: true, opacity: 0.90, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const midMat   = new THREE.PointsMaterial({ color: 0x00BBCC, size: 0.016, transparent: true, opacity: 0.72, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const outerMat = new THREE.PointsMaterial({ color: 0xC89020, size: 0.012, transparent: true, opacity: 0.45, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending })

    return { innerGeo, midGeo, outerGeo, innerMat, midMat, outerMat }
  }, [])

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime() * speed
    if (innerRef.current) { innerRef.current.rotation.y = t * 0.28; innerRef.current.rotation.x = t * 0.09 }
    if (midRef.current)   { midRef.current.rotation.y   = -t * 0.18; midRef.current.rotation.z = t * 0.07 }
    if (outerRef.current) { outerRef.current.rotation.y = t * 0.11; outerRef.current.rotation.x = -t * 0.05 }
    innerMat.opacity = 0.72 + 0.28 * Math.sin(t * 1.6) * intensity
    midMat.opacity   = 0.55 + 0.20 * Math.sin(t * 1.2 + 1) * intensity
    outerMat.opacity = 0.28 + 0.18 * Math.sin(t * 0.9 + 2) * intensity
  })

  return (
    <>
      <group ref={innerRef}><points geometry={innerGeo}><primitive object={innerMat} attach="material" /></points></group>
      <group ref={midRef}  ><points geometry={midGeo}  ><primitive object={midMat}   attach="material" /></points></group>
      <group ref={outerRef}><points geometry={outerGeo}><primitive object={outerMat} attach="material" /></points></group>
    </>
  )
}

// ─── Star Field ───────────────────────────────────────────────────────────────

function StarField() {
  const { positions, colors } = useMemo(() => {
    const N = 1800    // reduced from 2400 — contributes little visually, saves fillrate
    const positions = new Float32Array(N * 3)
    const colors    = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r  = 80 + Math.random() * 90
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      positions[i*3]   = r * Math.sin(ph) * Math.cos(th)
      positions[i*3+1] = r * Math.cos(ph)
      positions[i*3+2] = r * Math.sin(ph) * Math.sin(th)
      const k = 0.18 + Math.random() * 0.82
      colors[i*3]   = k * 0.35
      colors[i*3+1] = k * 0.50
      colors[i*3+2] = k
    }
    return { positions, colors }
  }, [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={positions.length/3} itemSize={3} />
        <bufferAttribute attach="attributes-color"    array={colors}    count={colors.length/3}    itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.09} vertexColors transparent opacity={0.72} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

// ─── Agent Info Panel ─────────────────────────────────────────────────────────

const METRICS: Record<string, Array<{ lbl: string; val: string; fill: number }>> = {
  charon:     [{ lbl:'REQUESTS', val:'1.2K/s', fill:72}, { lbl:'LATENCY', val:'12ms',  fill:60}, { lbl:'UPTIME', val:'99.9%', fill:99}],
  persephone: [{ lbl:'BALANCE',  val:'$48.2K', fill:68}, { lbl:'PENDING', val:'$3.1K', fill:28}, { lbl:'BURNS',  val:'14',    fill:14}],
  minos:      [{ lbl:'PENDING',  val:'3',      fill:30}, { lbl:'APROBADAS',val:'340',  fill:99}, { lbl:'ACC.',   val:'99.8%', fill:99}],
  cerberus:   [{ lbl:'AMENAZAS', val:'0',      fill:0 }, { lbl:'BLOQUEOS', val:'47/h', fill:47}, { lbl:'REGLAS', val:'128',   fill:50}],
  elysium:    [{ lbl:'TAREAS',   val:'7',      fill:70}, { lbl:'A TIEMPO', val:'100%', fill:100},{ lbl:'SCORE',  val:'9.4',   fill:94}],
  tartarus:   [{ lbl:'COLA',     val:'1.8K',   fill:85}, { lbl:'PROF.',    val:'L-7',  fill:70}, { lbl:'ETA',    val:'14m',   fill:30}],
}

function AgentPanel({ agent, onClose }: { agent: AgentCfg; onClose: () => void }) {
  const metrics   = METRICS[agent.id] ?? []
  const isAlert   = agent.status === 'alert'
  const accentStr = '#' + agent.accentHex.toString(16).padStart(6, '0')
  const statColor = isAlert ? '#FF4422' : agent.status === 'standby' ? '#C9A84C' : '#00EE88'

  return (
    <Html center distanceFactor={5.5} style={{ pointerEvents:'none' }} position={[2.5, 0.8, 0]}>
      <div style={{ background:'rgba(2,5,16,0.96)', border:`1px solid ${accentStr}50`, borderRadius:'8px', width:'228px', backdropFilter:'blur(24px)', pointerEvents:'auto', overflow:'hidden' }}>
        <div style={{ height:'2px', background:`linear-gradient(90deg, ${accentStr}, #C89020)` }} />
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid rgba(8,124,255,0.10)', display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ flex:1, fontSize:'12px', fontWeight:700, letterSpacing:'0.12em', color:'#D7EEFF', fontFamily:'"Inter", sans-serif' }}>{agent.name}</div>
          <div style={{ fontSize:'7px', padding:'2px 7px', borderRadius:'10px', background:`${statColor}18`, color:statColor, border:`1px solid ${statColor}44`, fontFamily:'"Inter", sans-serif', letterSpacing:'0.12em' }}>
            {isAlert ? 'ALERTA' : 'ACTIVO'}
          </div>
          <button onClick={onClose} style={{ width:'18px', height:'18px', border:'1px solid rgba(215,238,255,0.15)', borderRadius:'3px', background:'transparent', color:'rgba(215,238,255,0.45)', cursor:'pointer', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'auto' }}>✕</button>
        </div>
        <div style={{ padding:'8px 12px 12px' }}>
          <div style={{ fontSize:'8px', letterSpacing:'0.16em', color:`${accentStr}CC`, textTransform:'uppercase', marginBottom:'6px', fontFamily:'"Inter", sans-serif' }}>{agent.role}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'5px' }}>
            {metrics.map(m => (
              <div key={m.lbl} style={{ background:'rgba(0,85,255,0.05)', border:'1px solid rgba(8,124,255,0.10)', borderRadius:'4px', padding:'5px', textAlign:'center' }}>
                <div style={{ fontSize:'11px', fontWeight:600, color:accentStr, fontFamily:'"Inter", sans-serif', fontVariantNumeric:'tabular-nums' }}>{m.val}</div>
                <div style={{ fontSize:'7px', color:'rgba(215,238,255,0.35)', letterSpacing:'0.08em', marginTop:'1px', fontFamily:'"Inter", sans-serif' }}>{m.lbl}</div>
                <div style={{ height:'2px', background:'rgba(215,238,255,0.06)', borderRadius:'1px', marginTop:'4px' }}>
                  <div style={{ width:`${m.fill}%`, height:'100%', background:accentStr, borderRadius:'1px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Html>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

interface SceneProps {
  state:           HadesCoreState
  paused:          boolean
  showConnections: boolean
  reducedMotion:   boolean
  onAgentSelect?:  (name: string) => void
}

function HadesCoreScene({ state, paused, showConnections, reducedMotion, onAgentSelect }: SceneProps) {
  const p     = STATES[state]
  const speed = reducedMotion ? p.speed * 0.30 : p.speed

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const agentGroupRefs = useRef<(THREE.Group | null)[]>(Array(AGENTS.length).fill(null))
  const agentRefs      = useMemo(() => AGENTS.map(() => ({ current: null as THREE.Group | null })), [])

  useFrame(() => {
    AGENTS.forEach((_, i) => { agentGroupRefs.current[i] = agentRefs[i].current })
  })

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
    const a = AGENTS.find(a => a.id === id)
    if (a) onAgentSelect?.(a.name)
  }, [onAgentSelect])

  const selectedAgent = AGENTS.find(a => a.id === selectedId) ?? null

  return (
    <>
      {/* Lighting: hemisphere gives crystal faces ambient gradient; point lights add color drama */}
      <ambientLight intensity={0.04} color="#010508" />
      <hemisphereLight args={['#0A1A44', '#020408', 0.55]} />
      <pointLight position={[0, 0.5, 0]}  color="#0055FF" intensity={3.2 + p.intensity * 2.0} distance={9}  decay={2} />
      <pointLight position={[4.5, 8, 2.5]} color="#C89020" intensity={1.8} distance={22} decay={2} />
      <pointLight position={[-3, 2, -4]}   color="#003366" intensity={1.2} decay={2} />
      <pointLight position={[0, -1.5, 0]}  color="#001644" intensity={0.6} decay={2} />

      <StarField />
      <TechPlatform intensity={p.intensity} paused={paused} />

      {/* HADES CORE — dominant crystal architecture */}
      <CrystalCluster
        shards={CORE_SHARDS}
        heightBase={0.90}
        wScale={0.30}
        dScale={0.22}
        coreRadius={0.20}
        intensity={p.intensity}
        alertFactor={p.alertFactor}
        speed={speed}
        paused={paused}
        accentHex={0xC89020}      // gold edges — core signature
        emissiveHex={0x001A66}
      />

      {/* Fine blue-white / cyan / gold particles around the core */}
      <CoreParticles intensity={p.intensity} paused={paused} speed={speed} />

      {/* Core identity label */}
      <Html center distanceFactor={8} position={[0, -0.28, 0]} style={{ pointerEvents:'none' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'14px', fontWeight:700, letterSpacing:'0.30em', color:'#D7EEFF', fontFamily:'"Inter", system-ui, sans-serif', textShadow:'0 0 20px rgba(8,124,255,0.65)' }}>HADES</div>
          <div style={{ fontSize:'7px', letterSpacing:'0.25em', color:'rgba(92,207,255,0.52)', fontFamily:'"Inter", system-ui, sans-serif', marginTop:'2px' }}>SOVEREIGN INTELLIGENCE</div>
        </div>
      </Html>

      {/* 6 agents on unique 3D orbital planes */}
      {AGENTS.map((agent, i) => (
        <OrbitalAgent
          key={agent.id}
          agent={agent}
          intensity={p.intensity}
          alertFactor={p.alertFactor}
          speed={speed}
          paused={paused}
          isSelected={selectedId === agent.id}
          onSelect={handleSelect}
          groupRef={agentRefs[i]}
        />
      ))}

      {/* Per-agent colored neural filaments */}
      <NeuralFilaments
        agentGroupRefs={agentGroupRefs}
        intensity={p.intensity}
        alertFactor={p.alertFactor}
        speed={speed}
        paused={paused}
        visible={showConnections}
        selectedId={selectedId}
      />

      {selectedAgent && (
        <AgentPanel agent={selectedAgent} onClose={() => setSelectedId(null)} />
      )}

      <EffectComposer>
        <Bloom
          intensity={p.bloom}
          luminanceThreshold={0.48}
          luminanceSmoothing={0.06}
          radius={0.65}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.18} darkness={0.78} />
      </EffectComposer>
    </>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface HadesCoreProps {
  state?:           HadesCoreState
  paused?:          boolean
  showConnections?: boolean
  reducedMotion?:   boolean
  onAgentSelect?:   (name: string) => void
  style?:           CSSProperties
  className?:       string
}

export default function HadesCore({
  state           = 'IDLE',
  paused          = false,
  showConnections = true,
  reducedMotion   = false,
  onAgentSelect,
  style,
  className,
}: HadesCoreProps): JSX.Element {
  return (
    <Canvas
      camera={{ position: [0, 4.2, 7.8], fov: 46 }}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.96,
        powerPreference:     'high-performance',
      }}
      dpr={[1, 1.8]}   // cap at 1.8 instead of 2 — minor FPS benefit on high-DPI screens
      style={{ background: 'transparent', ...style }}
      className={className}
    >
      <AdaptiveDpr pixelated />
      <OrbitControls
        target={[0, 1.4, 0]}
        enableDamping
        dampingFactor={0.06}
        minDistance={4.5}
        maxDistance={22}
        autoRotate={!paused}
        autoRotateSpeed={0.20}
        enablePan={false}
      />
      <HadesCoreScene
        state={state}
        paused={paused}
        showConnections={showConnections}
        reducedMotion={reducedMotion}
        onAgentSelect={onAgentSelect}
      />
    </Canvas>
  )
}
