/**
 * HadesCore v6 — "Network Executive Core"
 *
 * Complete visual rethink: corporate AI intelligence platform, not sci-fi/videogame.
 *
 * Removed: CrystalShard, CrystalCluster, TechPlatform (arena), CoreParticles, StarField,
 *          orbital mechanics, platform rings, crystal shards — all "arena/game" language.
 *
 * Added:   ExecutiveCore (precision icosahedron), 6 static network nodes, fine data connections.
 *
 * Design language:
 *   - Core = cognitive engine / central processor (icosahedron = engineered precision)
 *   - Agents = executive modules / functional network nodes (not characters, not drones)
 *   - Lines = data mesh / operational connections (not filaments/tentacles)
 *   - Aesthetic: obsidian + electric-blue + discrete-gold — clean, precise, executive
 *
 * Priority: corporate readability → clarity → elegance → effects.
 * Effects are secondary. If something looks like a game, remove it.
 */

import { useRef, useMemo, useState, useCallback, CSSProperties } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, AdaptiveDpr } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ─── State System ─────────────────────────────────────────────────────────────

export type HadesCoreState =
  | 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ALERT' | 'COMPLETED'

interface SP { intensity: number; alertFactor: number; speed: number; bloom: number }

const STATES: Record<HadesCoreState, SP> = {
  IDLE:      { intensity: 0.42, alertFactor: 0,   speed: 0.62, bloom: 0.18 },
  THINKING:  { intensity: 0.65, alertFactor: 0,   speed: 1.05, bloom: 0.28 },
  EXECUTING: { intensity: 0.90, alertFactor: 0,   speed: 1.45, bloom: 0.38 },
  WAITING:   { intensity: 0.20, alertFactor: 0,   speed: 0.38, bloom: 0.10 },
  ALERT:     { intensity: 0.88, alertFactor: 1.0, speed: 1.30, bloom: 0.50 },
  COMPLETED: { intensity: 0.55, alertFactor: 0,   speed: 0.78, bloom: 0.22 },
}

// ─── Shared geometry (module-level, never re-created) ─────────────────────────

const ICO_GEO   = new THREE.IcosahedronGeometry(0.65, 0)
const ICO_EDGES = new THREE.EdgesGeometry(ICO_GEO, 1)

// ─── Agent Config ─────────────────────────────────────────────────────────────

interface AgentCfg {
  id:        string
  name:      string
  role:      string
  position:  [number, number, number]
  accentHex: number
  status:    'active' | 'standby' | 'alert'
}

// Hexagonal network topology: 6 nodes at R ≈ 2.1, slight Y-variation for 3D depth.
// 60° apart, pairs visually balanced — reads as organized network, not solar system.
export const AGENTS: AgentCfg[] = [
  { id:'cerberus',   name:'CERBERUS',   role:'Seguridad & Políticas',      position:[ 0.00,  0.28,-2.12], accentHex:0xAA2A1C, status:'active'  },
  { id:'minos',      name:'MINOS',      role:'Validación & Aprobaciones',  position:[ 1.84,  0.12,-1.06], accentHex:0xAA8C14, status:'active'  },
  { id:'persephone', name:'PERSEPHONE', role:'Finanzas & Presupuesto',     position:[ 1.84, -0.12, 1.06], accentHex:0x009988, status:'active'  },
  { id:'charon',     name:'CHARON',     role:'Compras & Proveedores',      position:[ 0.00, -0.28, 2.12], accentHex:0x1280A0, status:'active'  },
  { id:'elysium',    name:'ELYSIUM',    role:'Planificación & Resultados', position:[-1.84, -0.12, 1.06], accentHex:0x6688BB, status:'active'  },
  { id:'tartarus',   name:'TARTARUS',   role:'Anomalías & Contención',     position:[-1.84,  0.12,-1.06], accentHex:0x6622AA, status:'alert'   },
]

// Deterministic per-agent phase offset so nodes pulse at different moments
const agentPhase = (id: string): number =>
  (id.charCodeAt(0) + id.charCodeAt(1)) % 12 * 0.52

const N_FLOW = 4  // data-flow particles per connection — minimal, precise

// ─── Executive Core ──────────────────────────────────────────────────────────
// Icosahedron (20 triangular faces) = precision-engineered geometric architecture.
// Reads as: cognitive engine, processing core — NOT a game crystal or magic item.

interface CoreProps {
  intensity:   number
  alertFactor: number
  speed:       number
  paused:      boolean
}

function ExecutiveCore({ intensity, alertFactor, speed, paused }: CoreProps) {
  const groupRef    = useRef<THREE.Group>(null)
  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const edgeMatRef  = useRef<THREE.LineBasicMaterial>(null)
  const lightRef    = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime() * speed

    // Dignified rotation — slow, intentional, not theatrical
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.0014 * speed
      groupRef.current.rotation.x = Math.sin(t * 0.11) * 0.036
    }

    if (innerMatRef.current) {
      innerMatRef.current.emissiveIntensity = 0.48 + 0.26 * Math.sin(t * 1.3) * intensity
      innerMatRef.current.emissive.setHex(alertFactor > 0.5 ? 0xFF1100 : 0x0044CC)
    }

    if (edgeMatRef.current) {
      edgeMatRef.current.opacity = 0.36 + 0.14 * Math.sin(t * 0.85) * intensity
      edgeMatRef.current.color.setHex(alertFactor > 0.5 ? 0xFF4422 : 0xC89020)
    }

    if (lightRef.current) {
      lightRef.current.intensity = (0.82 + 0.32 * Math.sin(t * 1.65)) * intensity
      lightRef.current.color.setHex(alertFactor > 0.5 ? 0xFF2200 : 0x0033BB)
    }
  })

  return (
    <group ref={groupRef}>
      {/* Outer precision polyhedron — obsidian */}
      <mesh geometry={ICO_GEO}>
        <meshStandardMaterial
          color={0x050A16}
          emissive={alertFactor > 0.5 ? 0xFF1100 : 0xC89020}
          emissiveIntensity={0.07}
          metalness={0.90}
          roughness={0.16}
        />
      </mesh>

      {/* Edge structure — discrete gold cage */}
      <lineSegments geometry={ICO_EDGES}>
        <lineBasicMaterial
          ref={edgeMatRef}
          color={0xC89020}
          transparent
          opacity={0.36}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* Inner cognitive sphere */}
      <mesh>
        <sphereGeometry args={[0.30, 18, 14]} />
        <meshStandardMaterial
          ref={innerMatRef}
          color={0x020810}
          emissive={0x0044CC}
          emissiveIntensity={0.48}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Central hot kernel */}
      <mesh>
        <sphereGeometry args={[0.10, 10, 8]} />
        <meshBasicMaterial
          color={0x6688CC}
          transparent
          opacity={0.62}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <pointLight ref={lightRef} color={0x0033BB} intensity={0.82} distance={5.5} decay={2} />
    </group>
  )
}

// ─── Agent Node ───────────────────────────────────────────────────────────────
// Executive module node. Reads as: functional unit, specialized processor.
// Static position (NOT orbiting) — nodes in a fixed network topology.

interface AgentNodeProps {
  agent:      AgentCfg
  intensity:  number
  speed:      number
  paused:     boolean
  isSelected: boolean
  onSelect:   (id: string) => void
}

function AgentNode({ agent, intensity, speed, paused, isSelected, onSelect }: AgentNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const isAlert = agent.status === 'alert'
  const phase   = agentPhase(agent.id)

  useFrame(({ clock }) => {
    if (!meshRef.current || paused) return
    const t = clock.getElapsedTime() * speed
    // Very subtle pulse — indicates activity, not drama
    meshRef.current.scale.setScalar(1.0 + 0.028 * Math.sin(t * 1.85 + phase) * intensity)
  })

  const statusColor = isAlert ? '#FF3322' : '#00BB55'

  return (
    <group
      position={agent.position}
      onClick={(e) => { e.stopPropagation(); onSelect(agent.id) }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      {/* Executive module sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.130, 14, 10]} />
        <meshStandardMaterial
          color={0x040810}
          emissive={isAlert ? 0xFF2200 : agent.accentHex}
          emissiveIntensity={isSelected ? 0.45 : 0.20}
          metalness={0.82}
          roughness={0.22}
        />
      </mesh>

      {/* Module ring — status/selection indicator */}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.225, isSelected ? 0.011 : 0.006, 6, 40]} />
        <meshBasicMaterial
          color={isAlert ? 0xFF3300 : agent.accentHex}
          transparent
          opacity={isSelected ? 0.90 : 0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Inner nucleus dot */}
      <mesh>
        <sphereGeometry args={[0.048, 8, 6]} />
        <meshBasicMaterial
          color={agent.accentHex}
          transparent
          opacity={0.68}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Clean executive label */}
      <Html
        center
        distanceFactor={7.5}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        position={[0, 0.36, 0]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            fontSize: '8px', fontWeight: 700, letterSpacing: '0.18em',
            color: '#C8DCF0', background: 'rgba(3,6,18,0.88)',
            padding: '2px 7px', borderRadius: '2px', backdropFilter: 'blur(6px)',
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            {agent.name}
          </div>
          <div style={{
            fontSize: '6.5px', letterSpacing: '0.06em',
            color: 'rgba(175,208,238,0.42)',
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            {agent.role}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: statusColor }} />
            <span style={{ fontSize: '6px', color: statusColor, letterSpacing: '0.10em', fontFamily: '"Inter", system-ui, sans-serif' }}>
              {isAlert ? 'ALERTA' : 'ACTIVO'}
            </span>
          </div>
        </div>
      </Html>
    </group>
  )
}

// ─── Data Connections ─────────────────────────────────────────────────────────
// Fine data lines from core to each module + minimal directional flow particles.
// Static line geometry (positions never change = zero geometry update cost).
// Reads as: data mesh, operational network — NOT tentacles or filaments.

interface ConnectionsProps {
  intensity:   number
  alertFactor: number
  speed:       number
  paused:      boolean
  visible:     boolean
  selectedId:  string | null
}

function DataConnections({
  intensity, alertFactor, speed, paused, visible, selectedId,
}: ConnectionsProps) {

  const { lineObjs, lineMats, flowObjs, flowGeos, flowMats, flowOffsets } = useMemo(() => {
    const lineMats = AGENTS.map(() => new THREE.LineBasicMaterial({
      color: 0x0A4A77, transparent: true, opacity: 0.20,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }))

    // Static geometries — 2 points per line, created once, never updated
    const lineGeos = AGENTS.map(a => {
      const [x, y, z] = a.position
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, x, y, z]), 3))
      return g
    })

    const lineObjs = AGENTS.map((_, i) => new THREE.Line(lineGeos[i], lineMats[i]))

    const flowGeos = AGENTS.map(() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLOW * 3), 3))
      return g
    })

    const flowMats = AGENTS.map(a => new THREE.PointsMaterial({
      color: a.accentHex, size: 0.015, transparent: true, opacity: 0.75,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
    }))

    const flowObjs    = AGENTS.map((_, i) => new THREE.Points(flowGeos[i], flowMats[i]))
    const flowOffsets = AGENTS.map(() => Array.from({ length: N_FLOW }, (_, j) => j / N_FLOW))

    return { lineObjs, lineMats, flowObjs, flowGeos, flowMats, flowOffsets }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Single useFrame for all 6 connections — only updates materials and flow positions
  useFrame(({ clock }) => {
    if (!visible || paused) return
    const T = clock.getElapsedTime() * speed

    AGENTS.forEach((a, i) => {
      const [ax, ay, az] = a.position
      const isAlert    = a.status === 'alert' || alertFactor > 0.5
      const isSelected = selectedId === a.id

      // Line opacity: selected is brighter, unselected is very subtle
      lineMats[i].opacity = isSelected
        ? 0.55
        : 0.14 + 0.07 * Math.sin(T * 0.65 + i) * intensity
      lineMats[i].color.setHex(
        isAlert    ? 0xAA1100 :
        isSelected ? 0x1A7AB8 : 0x0A4A77,
      )

      // Flow particles: linear interpolation from core → agent
      const arr = flowGeos[i].attributes.position.array as Float32Array
      const spd = 0.08 + i * 0.008
      flowOffsets[i].forEach((off, j) => {
        const t  = (off + T * spd) % 1.0
        arr[j*3]   = ax * t
        arr[j*3+1] = ay * t
        arr[j*3+2] = az * t
      })
      flowGeos[i].attributes.position.needsUpdate = true

      flowMats[i].color.setHex(isAlert ? 0xFF3300 : a.accentHex)
      flowMats[i].opacity = 0.58 + 0.22 * Math.sin(T * 1.1 + i * 0.85) * intensity
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

// ─── Agent Info Panel ─────────────────────────────────────────────────────────
// Simplified, clean — executive data display.

const METRICS: Record<string, Array<{ lbl: string; val: string; fill: number }>> = {
  charon:     [{ lbl:'REQUESTS', val:'1.2K/s', fill:72 }, { lbl:'LATENCY', val:'12ms',  fill:60 }, { lbl:'UPTIME', val:'99.9%', fill:99 }],
  persephone: [{ lbl:'BALANCE',  val:'$48.2K', fill:68 }, { lbl:'PENDING', val:'$3.1K', fill:28 }, { lbl:'BURNS',  val:'14',    fill:14 }],
  minos:      [{ lbl:'PENDING',  val:'3',      fill:30 }, { lbl:'APROB.',  val:'340',   fill:99 }, { lbl:'ACC.',   val:'99.8%', fill:99 }],
  cerberus:   [{ lbl:'AMENAZAS', val:'0',      fill:0  }, { lbl:'BLOQ.',   val:'47/h',  fill:47 }, { lbl:'REGLAS', val:'128',   fill:50 }],
  elysium:    [{ lbl:'TAREAS',   val:'7',      fill:70 }, { lbl:'A TIEMPO',val:'100%',  fill:100}, { lbl:'SCORE',  val:'9.4',   fill:94 }],
  tartarus:   [{ lbl:'COLA',     val:'1.8K',   fill:85 }, { lbl:'PROF.',   val:'L-7',   fill:70 }, { lbl:'ETA',    val:'14m',   fill:30 }],
}

function AgentPanel({ agent, onClose }: { agent: AgentCfg; onClose: () => void }) {
  const [ax, ay, az]  = agent.position
  // Position panel outward from agent, slightly elevated
  const panelPos: [number, number, number] = [ax * 1.48, ay + 0.28, az * 0.68]
  const accentStr     = '#' + agent.accentHex.toString(16).padStart(6, '0')
  const metrics       = METRICS[agent.id] ?? []
  const isAlert       = agent.status === 'alert'
  const statColor     = isAlert ? '#FF4422' : '#00BB55'

  return (
    <Html center distanceFactor={5.5} style={{ pointerEvents: 'none' }} position={panelPos}>
      <div style={{
        background: 'rgba(2,5,16,0.95)', border: `1px solid ${accentStr}28`,
        borderRadius: '6px', width: '196px', backdropFilter: 'blur(20px)',
        pointerEvents: 'auto', overflow: 'hidden',
      }}>
        <div style={{ height: '1.5px', background: `linear-gradient(90deg, ${accentStr}66, #C89020)` }} />
        <div style={{ padding: '8px 10px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ flex: 1, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#C8DCF0', fontFamily: '"Inter", sans-serif' }}>
              {agent.name}
            </span>
            <span style={{ fontSize: '7px', padding: '2px 6px', borderRadius: '10px', background: `${statColor}14`, color: statColor, border: `1px solid ${statColor}30`, fontFamily: '"Inter", sans-serif', letterSpacing: '0.10em', marginRight: '6px' }}>
              {isAlert ? 'ALERTA' : 'ACTIVO'}
            </span>
            <button
              onClick={onClose}
              style={{ width: '16px', height: '16px', border: '1px solid rgba(200,220,240,0.12)', borderRadius: '3px', background: 'transparent', color: 'rgba(200,220,240,0.40)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
            >✕</button>
          </div>
          <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: `${accentStr}99`, marginBottom: '7px', fontFamily: '"Inter", sans-serif' }}>
            {agent.role}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px' }}>
            {metrics.map(m => (
              <div key={m.lbl} style={{ background: 'rgba(0,60,140,0.06)', border: '1px solid rgba(0,80,180,0.10)', borderRadius: '3px', padding: '5px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: accentStr, fontFamily: '"Inter", sans-serif', fontVariantNumeric: 'tabular-nums' }}>{m.val}</div>
                <div style={{ fontSize: '7px', color: 'rgba(175,208,238,0.35)', letterSpacing: '0.06em', marginTop: '1px', fontFamily: '"Inter", sans-serif' }}>{m.lbl}</div>
                <div style={{ height: '1.5px', background: 'rgba(175,208,238,0.06)', borderRadius: '1px', marginTop: '3px' }}>
                  <div style={{ width: `${m.fill}%`, height: '100%', background: accentStr, borderRadius: '1px' }} />
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

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
    const a = AGENTS.find(a => a.id === id)
    if (a) onAgentSelect?.(a.name)
  }, [onAgentSelect])

  const selectedAgent = AGENTS.find(a => a.id === selectedId) ?? null

  return (
    <>
      {/* Lighting: controlled executive environment — no dramatic game lighting */}
      <ambientLight intensity={0.05} color="#020508" />
      <hemisphereLight args={['#0A1A40', '#020408', 0.50]} />
      <pointLight position={[ 3.5,  6.0,  2.0]} color="#C89020" intensity={1.4} distance={18} decay={2} />
      <pointLight position={[-2.0,  2.0, -3.0]} color="#003366" intensity={0.9} distance={12} decay={2} />
      <pointLight position={[ 0.0, -0.5,  0.0]} color="#000D22" intensity={0.3} decay={2} />

      {/* Central cognitive core */}
      <ExecutiveCore
        intensity={p.intensity}
        alertFactor={p.alertFactor}
        speed={speed}
        paused={paused}
      />

      {/* HADES identity label */}
      <Html center distanceFactor={7} position={[0, -0.98, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.30em', color: '#C8DCF0', fontFamily: '"Inter", system-ui, sans-serif', textShadow: '0 0 14px rgba(0,68,204,0.52)' }}>
            HADES
          </div>
          <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: 'rgba(100,175,255,0.42)', fontFamily: '"Inter", system-ui, sans-serif', marginTop: '2px' }}>
            SOVEREIGN INTELLIGENCE
          </div>
        </div>
      </Html>

      {/* Data connection mesh */}
      <DataConnections
        intensity={p.intensity}
        alertFactor={p.alertFactor}
        speed={speed}
        paused={paused}
        visible={showConnections}
        selectedId={selectedId}
      />

      {/* 6 executive module nodes — static hexagonal positions */}
      {AGENTS.map(agent => (
        <AgentNode
          key={agent.id}
          agent={agent}
          intensity={p.intensity}
          speed={speed}
          paused={paused}
          isSelected={selectedId === agent.id}
          onSelect={handleSelect}
        />
      ))}

      {selectedAgent && (
        <AgentPanel agent={selectedAgent} onClose={() => setSelectedId(null)} />
      )}

      {/* Minimal effects — executive, not theatrical. Bloom threshold high: only true emissives glow. */}
      <EffectComposer>
        <Bloom
          intensity={p.bloom}
          luminanceThreshold={0.70}
          luminanceSmoothing={0.04}
          radius={0.55}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.14} darkness={0.70} />
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
      camera={{ position: [0, 2.6, 5.4], fov: 44 }}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.90,
        powerPreference:     'high-performance',
      }}
      dpr={[1, 1.8]}
      style={{ background: 'transparent', ...style }}
      className={className}
    >
      <AdaptiveDpr pixelated />
      <OrbitControls
        target={[0, 0.2, 0]}
        enableDamping
        dampingFactor={0.06}
        minDistance={4}
        maxDistance={18}
        maxPolarAngle={Math.PI * 0.72}
        autoRotate={!paused}
        autoRotateSpeed={0.10}
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
