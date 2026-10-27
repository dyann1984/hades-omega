/**
 * HadesCore v7 — "Layered Cognitive Engine"
 *
 * Refinement of v6 Network Executive Core.
 * Balance between technological sophistication and enterprise design.
 *
 * ExecutiveCore: 5-layer concentric architecture — outer dark crystal shell →
 *   structural cage → inner rotating octahedron → nucleus sphere → hot kernel.
 *   Multiple dark crystal layers with controlled blue energy.
 *
 * AgentNode: Holographic executive module — angular octahedron body with accent
 *   edge cage, inner glow nucleus. NO rings (removed — "planet" visual language).
 *   Name, function, state visible inside compact inline label.
 *
 * Composition: tighter camera, R=1.96 hexagonal positions, fills center panel.
 *
 * Kept intact: AGENTS config, DataConnections, AgentPanel, state system, all
 *   selection / status / connection functionality.
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

// Core layers
const CORE_OUTER_GEO   = new THREE.IcosahedronGeometry(0.78, 1)   // subdivided outer shell
const CORE_OUTER_EDGES = new THREE.EdgesGeometry(CORE_OUTER_GEO, 1)
const CORE_CAGE_GEO    = new THREE.IcosahedronGeometry(0.65, 0)   // 20-face structural cage
const CORE_CAGE_EDGES  = new THREE.EdgesGeometry(CORE_CAGE_GEO, 1)
const CORE_INNER_GEO   = new THREE.OctahedronGeometry(0.42)       // inner rotating crystal

// Agent node geometry — reused across all 6 modules
const NODE_BODY_GEO  = new THREE.IcosahedronGeometry(0.155, 0)    // angular executive module
const NODE_BODY_EDGE = new THREE.EdgesGeometry(NODE_BODY_GEO, 1)

// ─── Agent Config ─────────────────────────────────────────────────────────────

interface AgentCfg {
  id:        string
  name:      string
  role:      string
  position:  [number, number, number]
  accentHex: number
  status:    'active' | 'standby' | 'alert'
}

// Hexagonal network topology: 6 nodes at R ≈ 1.96, slight Y-variation for 3D depth.
// Tighter than v6 — reduces empty space, fills dashboard center panel better.
export const AGENTS: AgentCfg[] = [
  { id:'cerberus',   name:'CERBERUS',   role:'Seguridad & Políticas',      position:[ 0.00,  0.24,-1.96], accentHex:0xCC3318, status:'active'  },
  { id:'minos',      name:'MINOS',      role:'Validación & Aprobaciones',  position:[ 1.70,  0.10,-0.98], accentHex:0xBB9A18, status:'active'  },
  { id:'persephone', name:'PERSEPHONE', role:'Finanzas & Presupuesto',     position:[ 1.70, -0.10, 0.98], accentHex:0x00AA88, status:'active'  },
  { id:'charon',     name:'CHARON',     role:'Compras & Proveedores',      position:[ 0.00, -0.24, 1.96], accentHex:0x1488BB, status:'active'  },
  { id:'elysium',    name:'ELYSIUM',    role:'Planificación & Resultados', position:[-1.70, -0.10, 0.98], accentHex:0x5577CC, status:'active'  },
  { id:'tartarus',   name:'TARTARUS',   role:'Anomalías & Contención',     position:[-1.70,  0.10,-0.98], accentHex:0x7722BB, status:'alert'   },
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
  const outerGroupRef  = useRef<THREE.Group>(null)
  const innerGroupRef  = useRef<THREE.Group>(null)  // counter-rotates
  const octRef         = useRef<THREE.Group>(null)   // inner crystal, faster rotation
  const outerShellMat  = useRef<THREE.MeshStandardMaterial>(null)
  const outerEdgeMat   = useRef<THREE.LineBasicMaterial>(null)
  const cageMat        = useRef<THREE.LineBasicMaterial>(null)
  const octMat         = useRef<THREE.MeshStandardMaterial>(null)
  const nucleusMat     = useRef<THREE.MeshStandardMaterial>(null)
  const lightRef       = useRef<THREE.PointLight>(null)
  const rimLightRef    = useRef<THREE.PointLight>(null)

  const isAlert = alertFactor > 0.5

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime() * speed

    // Outer shell — slow dignified rotation
    if (outerGroupRef.current) {
      outerGroupRef.current.rotation.y += 0.0010 * speed
      outerGroupRef.current.rotation.x = Math.sin(t * 0.09) * 0.028
    }
    // Inner cage — slight counter-rotation for depth perception
    if (innerGroupRef.current) {
      innerGroupRef.current.rotation.y -= 0.0016 * speed
      innerGroupRef.current.rotation.z = Math.sin(t * 0.13) * 0.018
    }
    // Inner octahedron — faster, different axis, creates activity feel
    if (octRef.current) {
      octRef.current.rotation.y += 0.0038 * speed
      octRef.current.rotation.x += 0.0022 * speed
    }

    const glow = Math.sin(t * 1.4)

    // Outer shell — dark obsidian with subtle emissive breath
    if (outerShellMat.current) {
      outerShellMat.current.emissiveIntensity = (isAlert ? 0.12 : 0.05) + 0.04 * glow * intensity
      outerShellMat.current.emissive.setHex(isAlert ? 0xFF1100 : 0x001844)
    }

    // Outer gold edge cage
    if (outerEdgeMat.current) {
      outerEdgeMat.current.opacity = 0.18 + 0.10 * Math.sin(t * 0.72) * intensity
      outerEdgeMat.current.color.setHex(isAlert ? 0xFF5500 : 0xB07818)
    }

    // Inner structural cage — stronger gold
    if (cageMat.current) {
      cageMat.current.opacity = 0.55 + 0.18 * glow * intensity
      cageMat.current.color.setHex(isAlert ? 0xFF4422 : 0xC89020)
    }

    // Inner rotating octahedron — blue crystal, primary energy indicator
    if (octMat.current) {
      octMat.current.emissiveIntensity = (0.55 + 0.30 * glow) * intensity
      octMat.current.emissive.setHex(isAlert ? 0xFF2200 : 0x0055CC)
    }

    // Nucleus sphere — bright cognitive core
    if (nucleusMat.current) {
      nucleusMat.current.emissiveIntensity = (0.72 + 0.28 * Math.sin(t * 1.9)) * intensity
      nucleusMat.current.emissive.setHex(isAlert ? 0xFF3300 : 0x0066EE)
    }

    if (lightRef.current) {
      lightRef.current.intensity = (1.0 + 0.38 * glow) * intensity
      lightRef.current.color.setHex(isAlert ? 0xFF2200 : 0x0044CC)
    }
    if (rimLightRef.current) {
      rimLightRef.current.intensity = 0.45 * intensity
    }
  })

  return (
    <group>
      {/* ── Layer 1: outer dark crystal shell (slow rotation) ────────── */}
      <group ref={outerGroupRef}>
        <mesh geometry={CORE_OUTER_GEO}>
          <meshStandardMaterial
            ref={outerShellMat}
            color={0x040810}
            emissive={0x001844}
            emissiveIntensity={0.05}
            metalness={0.92}
            roughness={0.08}
            transparent
            opacity={0.72}
            side={THREE.FrontSide}
          />
        </mesh>
        <lineSegments geometry={CORE_OUTER_EDGES}>
          <lineBasicMaterial
            ref={outerEdgeMat}
            color={0xB07818}
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      </group>

      {/* ── Layer 2: structural gold cage (counter-rotation) ─────────── */}
      <group ref={innerGroupRef}>
        <lineSegments geometry={CORE_CAGE_EDGES}>
          <lineBasicMaterial
            ref={cageMat}
            color={0xC89020}
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      </group>

      {/* ── Layer 3: inner rotating octahedron crystal ────────────────── */}
      <group ref={octRef}>
        <mesh geometry={CORE_INNER_GEO}>
          <meshStandardMaterial
            ref={octMat}
            color={0x020614}
            emissive={0x0055CC}
            emissiveIntensity={0.55}
            metalness={0.85}
            roughness={0.12}
            transparent
            opacity={0.90}
          />
        </mesh>
        {/* Octahedron edge overlay */}
        <lineSegments geometry={new THREE.EdgesGeometry(CORE_INNER_GEO)}>
          <lineBasicMaterial
            color={0x2266DD}
            transparent
            opacity={0.35}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      </group>

      {/* ── Layer 4: smooth nucleus sphere — cognitive core ───────────── */}
      <mesh>
        <sphereGeometry args={[0.26, 24, 18]} />
        <meshStandardMaterial
          ref={nucleusMat}
          color={0x010510}
          emissive={0x0066EE}
          emissiveIntensity={0.72}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* ── Layer 5: hot kernel — central processing point ───────────── */}
      <mesh>
        <sphereGeometry args={[0.085, 10, 8]} />
        <meshBasicMaterial
          color={0x88AAFF}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Lights */}
      <pointLight ref={lightRef}    color={0x0044CC} intensity={1.0} distance={5.5} decay={2} />
      <pointLight ref={rimLightRef} color={0xC89020} intensity={0.45} distance={4.0} decay={2} position={[1.2, 1.8, 0.8]} />
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
  const groupRef   = useRef<THREE.Group>(null)
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const edgeMatRef = useRef<THREE.LineBasicMaterial>(null)
  const isAlert    = agent.status === 'alert'
  const phase      = agentPhase(agent.id)
  const accentStr  = '#' + agent.accentHex.toString(16).padStart(6, '0')
  const statusColor = isAlert ? '#FF4422' : '#00CC66'

  useFrame(({ clock }) => {
    if (!groupRef.current || paused) return
    const t = clock.getElapsedTime() * speed
    // Subtle pulse — breathes, not bounces
    const s = 1.0 + 0.022 * Math.sin(t * 1.8 + phase) * intensity
    groupRef.current.scale.setScalar(s)
    // Very slow self-rotation — executive module processing
    groupRef.current.rotation.y += 0.0008 * speed

    if (bodyMatRef.current) {
      bodyMatRef.current.emissiveIntensity = (isSelected ? 0.55 : 0.18) + 0.12 * Math.sin(t * 2.1 + phase) * intensity
    }
    if (edgeMatRef.current) {
      edgeMatRef.current.opacity = isSelected
        ? 0.85
        : 0.30 + 0.12 * Math.sin(t * 1.5 + phase) * intensity
    }
  })

  return (
    <group
      position={agent.position}
      onClick={(e) => { e.stopPropagation(); onSelect(agent.id) }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <group ref={groupRef}>
        {/* Holographic executive module — angular icosahedron body */}
        <mesh geometry={NODE_BODY_GEO}>
          <meshStandardMaterial
            ref={bodyMatRef}
            color={0x040810}
            emissive={isAlert ? 0xFF2200 : agent.accentHex}
            emissiveIntensity={isSelected ? 0.55 : 0.18}
            metalness={0.88}
            roughness={0.14}
          />
        </mesh>

        {/* Module edge cage — accent color structural overlay */}
        <lineSegments geometry={NODE_BODY_EDGE}>
          <lineBasicMaterial
            ref={edgeMatRef}
            color={isAlert ? 0xFF3300 : agent.accentHex}
            transparent
            opacity={isSelected ? 0.85 : 0.30}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>

        {/* Inner nucleus — bright hot point */}
        <mesh>
          <sphereGeometry args={[0.042, 8, 6]} />
          <meshBasicMaterial
            color={isAlert ? 0xFF4400 : agent.accentHex}
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Selection indicator — clean outer ring only when selected */}
        {isSelected && (
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.30, 0.006, 4, 48]} />
            <meshBasicMaterial
              color={agent.accentHex}
              transparent
              opacity={0.65}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}
      </group>

      {/* Holographic module label — compact, data-dense */}
      <Html
        center
        distanceFactor={7.0}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        position={[0, 0.42, 0]}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
          background: 'rgba(2,4,14,0.82)', border: `1px solid ${accentStr}22`,
          borderRadius: '3px', padding: '3px 8px', backdropFilter: 'blur(8px)',
          boxShadow: isSelected ? `0 0 12px ${accentStr}28` : 'none',
        }}>
          {/* Module name */}
          <div style={{
            fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.20em',
            color: isSelected ? accentStr : '#B8D4EE',
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            {agent.name}
          </div>
          {/* Function label */}
          <div style={{
            fontSize: '6px', letterSpacing: '0.06em',
            color: 'rgba(160,200,235,0.38)',
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            {agent.role}
          </div>
          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
            <div style={{
              width: '3px', height: '3px', borderRadius: '50%',
              background: statusColor, boxShadow: `0 0 4px ${statusColor}`,
            }} />
            <span style={{
              fontSize: '5.5px', color: statusColor, letterSpacing: '0.12em',
              fontFamily: '"Inter", system-ui, sans-serif',
            }}>
              {isAlert ? 'ALERTA' : agent.status === 'standby' ? 'STANDBY' : 'ACTIVO'}
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
      color: 0x0D5A8A, transparent: true, opacity: 0.24,
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
      {/* Lighting: precise corporate environment — surfaces read clearly */}
      <ambientLight intensity={0.06} color="#020608" />
      <hemisphereLight args={['#0C1E48', '#020408', 0.62]} />
      <pointLight position={[ 3.0,  5.0,  2.0]} color="#C89020" intensity={2.2} distance={20} decay={2} />
      <pointLight position={[-2.2,  2.2, -3.0]} color="#0044AA" intensity={1.4} distance={14} decay={2} />
      <pointLight position={[ 0.0,  3.5,  0.0]} color="#001840" intensity={0.6} distance={8}  decay={2} />

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
          luminanceThreshold={0.62}
          luminanceSmoothing={0.06}
          radius={0.52}
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
      camera={{ position: [0, 2.0, 4.8], fov: 42 }}
      gl={{
        antialias:           true,
        alpha:               true,
        toneMapping:         THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
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
