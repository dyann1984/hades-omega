/**
 * HadesCore — SOVEREIGN NEURAL COMMAND CENTER
 *
 * Architecture:
 *  - Fixed hexagonal agent positions (NO orbital motion) — agents are stationed nodes, not planets
 *  - Multi-filament neural connections (2 lines per agent + dense data-flow particles)
 *  - Agent base rings: horizontal torus rings give each node an "established station" feel
 *  - Inner containment rings around the crystal core
 *  - Obsidian/blue/gold material language, unified across core and agents
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
  IDLE:      { intensity: 0.42, alertFactor: 0,   speed: 0.65, bloom: 0.48 },
  THINKING:  { intensity: 0.70, alertFactor: 0,   speed: 1.10, bloom: 0.62 },
  EXECUTING: { intensity: 1.00, alertFactor: 0,   speed: 1.55, bloom: 0.82 },
  WAITING:   { intensity: 0.26, alertFactor: 0,   speed: 0.40, bloom: 0.30 },
  ALERT:     { intensity: 0.92, alertFactor: 1.0, speed: 1.40, bloom: 0.92 },
  COMPLETED: { intensity: 0.65, alertFactor: 0,   speed: 0.85, bloom: 0.56 },
}

// ─── Shared Geometries (module-level, immutable) ──────────────────────────────

const OCT_GEO   = new THREE.OctahedronGeometry(1, 0)
const OCT_EDGES = new THREE.EdgesGeometry(OCT_GEO, 5)

// ─── Shard Definitions ───────────────────────────────────────────────────────
// r=radial dist, a=azimuth°, hs=height-scale, t=outward-tilt°, roll=roll°

interface ShardDef { r: number; a: number; hs: number; t: number; roll: number }

// HADES CORE — 12 shards, monumental spire cluster
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
// Agents are stationed at FIXED hexagonal positions — no orbital motion.
// floatPhase: per-agent offset for subtle Y oscillation.

interface AgentCfg {
  id:         string
  name:       string
  role:       string
  angle:      number     // fixed position angle in XZ plane (degrees)
  orbitR:     number     // fixed radial distance from core
  floatPhase: number     // Y-float animation phase offset
  shards:     ShardDef[]
  status:     'active' | 'standby' | 'alert'
}

// Hexagonal layout: 60° spacing, counter-clockwise from right
export const AGENTS: AgentCfg[] = [
  { id:'cerberus',   name:'CERBERUS',   role:'Seguridad & Políticas',      angle:  0, orbitR:3.30, floatPhase:0.00, shards:SHARDS_PRISM,   status:'active'  },
  { id:'minos',      name:'MINOS',      role:'Validación & Aprobaciones',  angle: 60, orbitR:3.20, floatPhase:1.05, shards:SHARDS_PRISM,   status:'active'  },
  { id:'persephone', name:'PERSEPHONE', role:'Finanzas & Presupuesto',     angle:120, orbitR:3.40, floatPhase:2.10, shards:SHARDS_TALL,    status:'active'  },
  { id:'charon',     name:'CHARON',     role:'Compras & Proveedores',      angle:180, orbitR:3.15, floatPhase:3.14, shards:SHARDS_ANGULAR, status:'active'  },
  { id:'elysium',    name:'ELYSIUM',    role:'Planificación & Resultados', angle:240, orbitR:3.25, floatPhase:4.19, shards:SHARDS_TALL,    status:'active'  },
  { id:'tartarus',   name:'TARTARUS',   role:'Anomalías & Contención',     angle:300, orbitR:3.50, floatPhase:5.24, shards:SHARDS_ANGULAR, status:'alert'   },
]

// ─── Crystal Shard ────────────────────────────────────────────────────────────

interface ShardProps {
  def:         ShardDef
  heightBase:  number
  wScale:      number
  dScale:      number
  intensity:   number
  alertFactor: number
  paused:      boolean
  phase:       number
}

function CrystalShard({ def, heightBase, wScale, dScale, intensity, alertFactor, paused, phase }: ShardProps) {
  const edgeMatRef = useRef<THREE.LineBasicMaterial>(null)
  const bodyMatRef = useRef<THREE.MeshPhysicalMaterial>(null)

  const H      = def.hs * heightBase
  const scaleY = H / 2
  const posY   = H / 2

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime()
    const beat = 0.55 + 0.35 * Math.sin(t * 1.1 + phase) * intensity

    if (edgeMatRef.current) {
      if (alertFactor > 0.1) {
        edgeMatRef.current.color.setRGB(0.95, 0.45 * beat, 0.02)
        edgeMatRef.current.opacity = 0.55 + 0.3 * beat
      } else {
        edgeMatRef.current.color.setRGB(0.82 * beat, 0.62 * beat, 0.14 * beat)
        edgeMatRef.current.opacity = 0.55 + 0.3 * beat
      }
    }

    if (bodyMatRef.current) {
      bodyMatRef.current.emissiveIntensity = 0.20 + 0.18 * Math.sin(t * 0.7 + phase) * intensity
    }
  })

  const phi = toRad(def.a)

  return (
    <group rotation-y={phi}>
      <group
        position-x={def.r}
        rotation-z={-toRad(def.t)}
        rotation-x={toRad(def.roll)}
      >
        <mesh geometry={OCT_GEO} position-y={posY} scale={[wScale, scaleY, dScale]}>
          <meshPhysicalMaterial
            ref={bodyMatRef}
            color={0x030810}
            emissive={alertFactor > 0.1 ? 0x150200 : 0x010618}
            emissiveIntensity={0.22}
            metalness={0.88}
            roughness={0.12}
            transmission={0.04}
            thickness={0.25}
            transparent
            opacity={0.94}
          />
        </mesh>
        <lineSegments geometry={OCT_EDGES} position-y={posY} scale={[wScale, scaleY, dScale]}>
          <lineBasicMaterial
            ref={edgeMatRef}
            color="#C89020"
            transparent
            opacity={0.65}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      </group>
    </group>
  )
}

// ─── Crystal Cluster ─────────────────────────────────────────────────────────

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
}

function CrystalCluster({ shards, heightBase, wScale, dScale, coreRadius, intensity, alertFactor, speed, paused }: ClusterProps) {
  const coreRef     = useRef<THREE.Mesh>(null)
  const coreMatRef  = useRef<THREE.MeshStandardMaterial>(null)
  const coreLightRef= useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime() * speed
    const pulse = 1.0 + 0.14 * Math.sin(t * 2.8) * intensity

    if (coreRef.current) coreRef.current.scale.setScalar(pulse)
    if (coreMatRef.current) {
      coreMatRef.current.emissiveIntensity = 3.5 + 1.8 * Math.sin(t * 2.2) * intensity
      coreMatRef.current.emissive.setHex(alertFactor > 0.1 ? 0xFF2200 : 0x0066FF)
    }
    if (coreLightRef.current) {
      const li = (1.2 + 0.8 * Math.sin(t * 1.8)) * intensity
      coreLightRef.current.intensity = alertFactor > 0.1 ? li * 0.7 : li
      coreLightRef.current.color.setHex(alertFactor > 0.1 ? 0xFF3300 : 0x0055FF)
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
          intensity={intensity}
          alertFactor={alertFactor}
          paused={paused}
          phase={i * 0.72 + def.a * 0.02}
        />
      ))}

      <mesh ref={coreRef}>
        <sphereGeometry args={[coreRadius, 16, 16]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color={0x001A66}
          emissive={0x0066FF}
          emissiveIntensity={3.5}
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[coreRadius * 0.55, 10, 10]} />
        <meshBasicMaterial
          color={0xAADDFF}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <pointLight
        ref={coreLightRef}
        color="#0055FF"
        intensity={1.2}
        distance={coreRadius * 15}
        decay={2}
      />
    </group>
  )
}

// ─── Containment Rings (around the HADES CORE base) ──────────────────────────
// Slow-rotating concentric torus rings between core and agents — "containment field"

function ContainmentRings({ intensity, alertFactor, paused }: { intensity: number; alertFactor: number; paused: boolean }) {
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const ring3Ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime()
    if (ring1Ref.current) ring1Ref.current.rotation.z = t * 0.08
    if (ring2Ref.current) ring2Ref.current.rotation.z = -t * 0.05
    if (ring3Ref.current) ring3Ref.current.rotation.z = t * 0.03

    const col = alertFactor > 0.1 ? 0xFF3300 : 0xC89020
    ;[ring1Ref, ring2Ref, ring3Ref].forEach((r, i) => {
      if (!r.current) return
      const m = (r.current.material as THREE.MeshBasicMaterial)
      m.color.setHex(col)
      m.opacity = (0.18 + 0.10 * Math.sin(t * 0.6 + i * 0.8)) * intensity
    })
  })

  return (
    <group position-y={0.07}>
      {/* Inner ring */}
      <mesh ref={ring1Ref} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.05, 0.018, 6, 80]} />
        <meshBasicMaterial
          color="#C89020"
          transparent opacity={0.20}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Middle ring — slightly tilted for 3D depth */}
      <mesh ref={ring2Ref} rotation-x={-Math.PI / 2 + 0.15} rotation-y={0.3}>
        <torusGeometry args={[1.65, 0.013, 6, 80]} />
        <meshBasicMaterial
          color="#C89020"
          transparent opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer ring — largest and most subtle */}
      <mesh ref={ring3Ref} rotation-x={-Math.PI / 2 - 0.12} rotation-y={-0.5}>
        <torusGeometry args={[2.30, 0.010, 6, 80]} />
        <meshBasicMaterial
          color="#C89020"
          transparent opacity={0.10}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
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
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = 0.35 + 0.28 * Math.sin(t * 0.5 + i * 0.8) * intensity
    })
  })

  const RING_RADII = [1.6, 2.8, 4.4, 5.2]

  return (
    <group position-y={-0.11}>
      <mesh>
        <cylinderGeometry args={[5.8, 5.8, 0.12, 72, 1]} />
        <meshPhysicalMaterial
          color={0x040812}
          metalness={0.92}
          roughness={0.10}
          reflectivity={0.6}
        />
      </mesh>

      <mesh position-y={0.061}>
        <cylinderGeometry args={[5.78, 5.78, 0.001, 72, 1]} />
        <meshPhysicalMaterial
          color={0x060C1A}
          metalness={1.0}
          roughness={0.05}
          transparent
          opacity={0.70}
        />
      </mesh>

      {RING_RADII.map((r, i) => (
        <mesh
          key={i}
          ref={el => { ringRefs.current[i] = el }}
          position-y={0.062}
          rotation-x={-Math.PI / 2}
        >
          <torusGeometry args={[r, 0.022, 6, 80]} />
          <meshBasicMaterial
            color="#C89020"
            transparent
            opacity={0.35 + i * 0.06}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      <mesh position-y={0.063} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.55, 48]} />
        <meshBasicMaterial
          color="#001A66"
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// ─── Stationed Agent ──────────────────────────────────────────────────────────
// Agents are FIXED nodes, not orbiting planets.
// Only animation: gentle Y-axis float (±0.12 units) with per-agent phase.

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

function StationedAgent({ agent, intensity, alertFactor, speed, paused, isSelected, onSelect, groupRef }: AgentProps) {
  const isAlert = agent.status === 'alert' || (agent.id === 'tartarus' && alertFactor > 0.5)
  const baseRingRef = useRef<THREE.Mesh>(null)

  const phi = toRad(agent.angle)
  const fixedX = agent.orbitR * Math.cos(phi)
  const fixedZ = agent.orbitR * Math.sin(phi)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const T = clock.getElapsedTime()

    const floatY = paused
      ? 0
      : 0.12 * Math.sin(T * 0.75 + agent.floatPhase)

    groupRef.current.position.set(fixedX, floatY, fixedZ)

    // Base ring pulse
    if (baseRingRef.current) {
      const m = baseRingRef.current.material as THREE.MeshBasicMaterial
      const beat = 0.40 + 0.25 * Math.sin(T * 0.9 + agent.floatPhase) * intensity
      m.opacity = isAlert ? 0.55 + 0.2 * beat : beat * 0.55
      m.color.setHex(isAlert ? 0xFF3300 : 0xC89020)
    }
  })

  const statusColor = isAlert ? '#FF3333' : agent.status === 'standby' ? '#C9A84C' : '#00EE88'
  const cR = isAlert ? 0.9 : intensity

  return (
    <group
      ref={groupRef as React.Ref<THREE.Group>}
      onClick={() => onSelect(agent.id)}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <CrystalCluster
        shards={agent.shards}
        heightBase={0.155}
        wScale={0.092}
        dScale={0.072}
        coreRadius={0.062}
        intensity={cR}
        alertFactor={isAlert ? 1 : 0}
        speed={speed}
        paused={paused}
      />

      {/* Station base ring — marks this as a fixed installation node, not a floating object */}
      <mesh ref={baseRingRef} position-y={-0.09} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.46, 0.022, 8, 48]} />
        <meshBasicMaterial
          color="#C89020"
          transparent
          opacity={0.40}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Secondary inner ring */}
      <mesh position-y={-0.09} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.28, 0.012, 6, 36]} />
        <meshBasicMaterial
          color="#0055FF"
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Selection highlight */}
      {isSelected && (
        <mesh position-y={-0.09} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[0.58, 0.016, 6, 48]} />
          <meshBasicMaterial color="#5CCFFF" blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      <Html
        center
        distanceFactor={9}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        position={[0, 0.72, 0]}
      >
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
          <div style={{
            fontSize:'9px', fontWeight:700, letterSpacing:'0.18em',
            color:'#D7EEFF', background:'rgba(2,4,14,0.82)',
            padding:'3px 8px', borderRadius:'2px',
            backdropFilter:'blur(6px)',
            fontFamily:'"Inter", system-ui, sans-serif',
          }}>
            {agent.name}
          </div>
          <div style={{
            fontSize:'7px', letterSpacing:'0.08em',
            color:'rgba(215,238,255,0.50)',
            fontFamily:'"Inter", system-ui, sans-serif',
          }}>
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

// ─── Neural Filaments (Connection Network) ────────────────────────────────────
// Two filaments per agent: main + offset parallel — reads as a data bundle,
// not a single decorative arc. Dense particle flow reinforces the data-transfer reading.

const N_SEGS    = 40
const N_FLOW    = 14
const VEC_ZERO  = new THREE.Vector3(0, 0, 0)

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
  const { mainObjs, offsetObjs, mainMats, offsetMats, flowGeos, flowOffsets } = useMemo(() => {
    const makeLineGeo = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N_SEGS+1)*3), 3))
      return g
    }

    const mainObjs   = AGENTS.map(() => new THREE.Line(makeLineGeo(), new THREE.LineBasicMaterial({
      color: 0x0066FF, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending,
    })))
    const offsetObjs = AGENTS.map(() => new THREE.Line(makeLineGeo(), new THREE.LineBasicMaterial({
      color: 0x0044CC, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending,
    })))

    const mainMats   = mainObjs.map(o => o.material as THREE.LineBasicMaterial)
    const offsetMats = offsetObjs.map(o => o.material as THREE.LineBasicMaterial)

    const flowGeos = AGENTS.map(() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLOW*3), 3))
      return g
    })
    const flowOffsets = AGENTS.map(() => Array.from({ length: N_FLOW }, (_, j) => j / N_FLOW))

    return { mainObjs, offsetObjs, mainMats, offsetMats, flowGeos, flowOffsets }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ptRefs = useRef<(THREE.Points | null)[]>([])

  useFrame(({ clock }) => {
    if (!visible || paused) return
    const T = clock.getElapsedTime() * speed

    AGENTS.forEach((agent, i) => {
      const grp = agentGroupRefs.current[i]
      if (!grp) return
      const aPos = grp.position.clone()

      // Main filament: direct elevated bezier core → agent
      const ctrl = new THREE.Vector3(aPos.x * 0.45, 0.55, aPos.z * 0.45)

      const mainGeo = mainObjs[i].geometry as THREE.BufferGeometry
      const mArr = mainGeo.attributes.position.array as Float32Array
      for (let s = 0; s <= N_SEGS; s++) {
        const pt = quad(VEC_ZERO, ctrl, aPos, s / N_SEGS)
        mArr[s*3]=pt.x; mArr[s*3+1]=pt.y; mArr[s*3+2]=pt.z
      }
      mainGeo.attributes.position.needsUpdate = true

      // Offset filament: perpendicular nudge + height variation
      const phi = toRad(agent.angle)
      const perpX = -Math.sin(phi) * 0.30
      const perpZ =  Math.cos(phi) * 0.30
      const ctrl2 = new THREE.Vector3(aPos.x * 0.5 + perpX, 0.36, aPos.z * 0.5 + perpZ)
      const end2  = new THREE.Vector3(aPos.x + perpX * 0.4, aPos.y, aPos.z + perpZ * 0.4)

      const offGeo = offsetObjs[i].geometry as THREE.BufferGeometry
      const oArr = offGeo.attributes.position.array as Float32Array
      for (let s = 0; s <= N_SEGS; s++) {
        const pt = quad(VEC_ZERO, ctrl2, end2, s / N_SEGS)
        oArr[s*3]=pt.x; oArr[s*3+1]=pt.y; oArr[s*3+2]=pt.z
      }
      offGeo.attributes.position.needsUpdate = true

      const isSel = selectedId === agent.id
      const col = alertFactor > 0.5 ? 0xFF2200 : 0x0066FF
      mainMats[i].opacity   = isSel ? 0.55 : 0.18 + intensity * 0.12
      offsetMats[i].opacity = isSel ? 0.30 : 0.10 + intensity * 0.06
      mainMats[i].color.setHex(col)
      offsetMats[i].color.setHex(alertFactor > 0.5 ? 0xFF4422 : 0x0044CC)

      // Data-flow particles along the main filament
      const fArr = flowGeos[i].attributes.position.array as Float32Array
      const flowSpd = 0.095 + (agent.floatPhase % 1) * 0.02
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
      {AGENTS.map((agent, i) => (
        <group key={agent.id}>
          <primitive object={mainObjs[i]} />
          <primitive object={offsetObjs[i]} />
          <points
            ref={el => { ptRefs.current[i] = el }}
            geometry={flowGeos[i]}
          >
            <pointsMaterial
              color={alertFactor > 0.5 ? '#FF3300' : '#0088FF'}
              size={0.062}
              transparent
              opacity={0.90}
              depthWrite={false}
              sizeAttenuation
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>
      ))}
    </group>
  )
}

// ─── Star Field ───────────────────────────────────────────────────────────────

function StarField() {
  const { positions, colors } = useMemo(() => {
    const N = 2400
    const positions = new Float32Array(N * 3)
    const colors    = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r  = 80 + Math.random() * 90
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      positions[i*3]   = r * Math.sin(ph) * Math.cos(th)
      positions[i*3+1] = r * Math.cos(ph)
      positions[i*3+2] = r * Math.sin(ph) * Math.sin(th)
      const k = 0.15 + Math.random() * 0.85
      colors[i*3]   = k * 0.40
      colors[i*3+1] = k * 0.52
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
      <pointsMaterial size={0.10} vertexColors transparent opacity={0.80} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
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
  const metrics     = METRICS[agent.id] ?? []
  const isAlert     = agent.status === 'alert'
  const accentColor = isAlert ? '#FF4422' : '#087CFF'
  const statusColor = isAlert ? '#FF4422' : agent.status === 'standby' ? '#C9A84C' : '#00EE88'

  return (
    <Html center distanceFactor={5.5} style={{ pointerEvents:'none' }} position={[2.6, 0.8, 0]}>
      <div style={{ background:'rgba(2,5,16,0.95)', border:`1px solid ${accentColor}50`, borderRadius:'8px', width:'228px', backdropFilter:'blur(24px)', pointerEvents:'auto', overflow:'hidden' }}>
        <div style={{ height:'2px', background:`linear-gradient(90deg, ${accentColor}, #C89020)` }} />
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid rgba(8,124,255,0.10)', display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ flex:1, fontSize:'12px', fontWeight:700, letterSpacing:'0.12em', color:'#D7EEFF', fontFamily:'"Inter", sans-serif' }}>{agent.name}</div>
          <div style={{ fontSize:'7px', letterSpacing:'0.12em', padding:'2px 7px', borderRadius:'10px', background:`${statusColor}18`, color:statusColor, border:`1px solid ${statusColor}44`, fontFamily:'"Inter", sans-serif' }}>
            {isAlert ? 'ALERTA' : 'ACTIVO'}
          </div>
          <button onClick={onClose} style={{ width:'18px', height:'18px', border:'1px solid rgba(215,238,255,0.15)', borderRadius:'3px', background:'transparent', color:'rgba(215,238,255,0.45)', cursor:'pointer', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'auto' }}>✕</button>
        </div>
        <div style={{ padding:'8px 12px 12px' }}>
          <div style={{ fontSize:'8px', letterSpacing:'0.16em', color:`${accentColor}CC`, textTransform:'uppercase', marginBottom:'6px', fontFamily:'"Inter", sans-serif' }}>{agent.role}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'5px' }}>
            {metrics.map(m => (
              <div key={m.lbl} style={{ background:'rgba(0,85,255,0.05)', border:'1px solid rgba(8,124,255,0.10)', borderRadius:'4px', padding:'5px', textAlign:'center' }}>
                <div style={{ fontSize:'11px', fontWeight:600, color:accentColor, fontFamily:'"Inter", sans-serif', fontVariantNumeric:'tabular-nums' }}>{m.val}</div>
                <div style={{ fontSize:'7px', color:'rgba(215,238,255,0.35)', letterSpacing:'0.08em', marginTop:'1px', fontFamily:'"Inter", sans-serif' }}>{m.lbl}</div>
                <div style={{ height:'2px', background:'rgba(215,238,255,0.06)', borderRadius:'1px', marginTop:'4px' }}>
                  <div style={{ width:`${m.fill}%`, height:'100%', background:accentColor, borderRadius:'1px' }} />
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
      {/* Lighting */}
      <ambientLight intensity={0.04} color="#020406" />
      <pointLight position={[0, 0.4, 0]}  color="#0055FF" intensity={2.5 + p.intensity * 1.5} distance={10} decay={2} />
      <pointLight position={[5, 7, 3]}    color="#C89020" intensity={1.2} distance={20} decay={2} />
      <pointLight position={[-4, 2, -5]}  color="#001A44" intensity={0.9} decay={2} />
      <pointLight position={[0, -2, 0]}   color="#000D33" intensity={0.5} decay={2} />

      <StarField />
      <TechPlatform intensity={p.intensity} paused={paused} />

      {/* HADES CORE monumental crystal cluster */}
      <CrystalCluster
        shards={CORE_SHARDS}
        heightBase={0.52}
        wScale={0.28}
        dScale={0.20}
        coreRadius={0.18}
        intensity={p.intensity}
        alertFactor={p.alertFactor}
        speed={speed}
        paused={paused}
      />

      {/* Containment rings — neural command center infrastructure */}
      <ContainmentRings intensity={p.intensity} alertFactor={p.alertFactor} paused={paused} />

      {/* Core identity label */}
      <Html center distanceFactor={8} position={[0, -0.22, 0]} style={{ pointerEvents:'none' }}>
        <div style={{ textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:'14px', fontWeight:700, letterSpacing:'0.30em', color:'#D7EEFF', fontFamily:'"Inter", system-ui, sans-serif', textShadow:'0 0 20px rgba(8,124,255,0.6)' }}>HADES</div>
          <div style={{ fontSize:'7px', letterSpacing:'0.25em', color:'rgba(92,207,255,0.55)', fontFamily:'"Inter", system-ui, sans-serif', marginTop:'2px' }}>SOVEREIGN INTELLIGENCE</div>
        </div>
      </Html>

      {/* Stationed agents — FIXED positions, no orbital motion */}
      {AGENTS.map((agent, i) => (
        <StationedAgent
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

      {/* Neural filament network */}
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
          luminanceThreshold={0.55}
          luminanceSmoothing={0.06}
          radius={0.70}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
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
      camera={{ position: [0, 5.5, 9.0], fov: 50 }}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.92,
        powerPreference:     'high-performance',
      }}
      dpr={[1, 2]}
      style={{ background: 'transparent', ...style }}
      className={className}
    >
      <AdaptiveDpr pixelated />
      <OrbitControls
        target={[0, 1.2, 0]}
        enableDamping
        dampingFactor={0.06}
        minDistance={5}
        maxDistance={24}
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
