import { useRef, useMemo, useCallback, useState, CSSProperties } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, AdaptiveDpr } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SovereignState =
  | 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ALERT' | 'COMPLETED'

interface StateParams {
  intensity:   number
  alertFactor: number
  speed:       number
  bloom:       number
}

const STATE_PARAMS: Record<SovereignState, StateParams> = {
  IDLE:      { intensity: 0.32, alertFactor: 0,   speed: 0.70, bloom: 0.35 },
  THINKING:  { intensity: 0.65, alertFactor: 0,   speed: 1.10, bloom: 0.55 },
  EXECUTING: { intensity: 1.00, alertFactor: 0,   speed: 1.60, bloom: 0.75 },
  WAITING:   { intensity: 0.22, alertFactor: 0,   speed: 0.45, bloom: 0.25 },
  ALERT:     { intensity: 0.88, alertFactor: 1.0, speed: 1.35, bloom: 0.85 },
  COMPLETED: { intensity: 0.60, alertFactor: 0,   speed: 0.90, bloom: 0.55 },
}

interface AgentConfig {
  id:       string
  name:     string
  symbol:   string
  role:     string
  orbitR:   number
  orbitSpd: number
  inc:      number
  lng:      number
  glowCol:  THREE.Color
  darkCol:  THREE.Color
  status:   'active' | 'standby' | 'alert'
}

// ─── Agent Definitions ────────────────────────────────────────────────────────

export const AGENTS: AgentConfig[] = [
  { id:'charon',     name:'CHARON',     symbol:'Χ', role:'Integrations & Providers', orbitR:2.9, orbitSpd:0.28, inc:18,  lng:0,   glowCol:new THREE.Color('#4A90D9'), darkCol:new THREE.Color('#0D2344'), status:'active'  },
  { id:'persephone', name:'PERSEPHONE', symbol:'Ψ', role:'Budget & Finance',         orbitR:3.2, orbitSpd:0.18, inc:52,  lng:60,  glowCol:new THREE.Color('#00E5CC'), darkCol:new THREE.Color('#003D35'), status:'active'  },
  { id:'minos',      name:'MINOS',      symbol:'Μ', role:'Evaluations & Approvals',  orbitR:3.0, orbitSpd:0.22, inc:80,  lng:130, glowCol:new THREE.Color('#C9A84C'), darkCol:new THREE.Color('#3D2800'), status:'standby' },
  { id:'cerberus',   name:'CERBERUS',   symbol:'Κ', role:'Security & Policies',      orbitR:3.4, orbitSpd:0.14, inc:122, lng:200, glowCol:new THREE.Color('#FF6B35'), darkCol:new THREE.Color('#3D1000'), status:'active'  },
  { id:'elysium',    name:'ELYSIUM',    symbol:'Ε', role:'Planning & Outcomes',      orbitR:2.8, orbitSpd:0.32, inc:158, lng:290, glowCol:new THREE.Color('#A8C8FF'), darkCol:new THREE.Color('#10143D'), status:'active'  },
  { id:'tartarus',   name:'TARTARUS',   symbol:'Τ', role:'Anomalies & Containment',  orbitR:3.6, orbitSpd:0.10, inc:-28, lng:340, glowCol:new THREE.Color('#9B59B6'), darkCol:new THREE.Color('#1A0040'), status:'alert'   },
]

// ─── GLSL Shaders ─────────────────────────────────────────────────────────────

const VERT_CONSCIOUSNESS = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDisplace;
  void main() {
    float t = u_time;
    float n1 = sin(position.y * 4.1 + t * 0.55) * cos(position.z * 3.7 - t * 0.42) * 0.09;
    float n2 = sin(position.z * 5.3 + t * 0.38) * cos(position.x * 4.4 + t * 0.31) * 0.07;
    float n3 = sin(position.x * 3.8 - t * 0.47) * cos(position.y * 5.1 - t * 0.28) * 0.05;
    float d = (n1 + n2 + n3) * (1.0 + u_intensity * 0.35);
    vec3 displaced = position * (1.0 + d);
    vDisplace = d;
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

const FRAG_CONSCIOUSNESS = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_alertFactor;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDisplace;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV  = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 2.6);
    float phi   = atan(vWorldPos.z, vWorldPos.x);
    float flow1 = sin(phi * 11.0 + u_time * 2.2) * cos(vWorldPos.y * 8.0 - u_time * 1.9);
    float flow2 = sin(vWorldPos.y * 6.5 + u_time * 1.7) * cos(phi * 7.0 + u_time * 2.8);
    float energy = ((flow1 * 0.55 + flow2 * 0.45) * 0.5 + 0.5) * u_intensity;
    float r    = length(vWorldPos);
    float wave = pow(sin(r * 11.0 - u_time * (2.8 + u_intensity * 2.1)) * 0.5 + 0.5, 2.5) * u_intensity * 0.28;
    vec3 veinBlue  = mix(vec3(0.02, 0.22, 0.88), vec3(0.1, 0.6, 1.0), energy);
    vec3 veinAlert = mix(vec3(0.72, 0.07, 0.02), vec3(0.92, 0.28, 0.05), energy);
    vec3 veinCol   = mix(veinBlue, veinAlert, u_alertFactor);
    vec3 rimBlue   = mix(vec3(0.04, 0.2, 0.9), vec3(0.1, 0.4, 1.0), fresnel);
    vec3 rimAlert  = mix(vec3(0.7, 0.08, 0.02), vec3(1.0, 0.25, 0.05), fresnel);
    vec3 rimCol    = mix(rimBlue, rimAlert, u_alertFactor * 0.7);
    vec3 col = vec3(0.006, 0.022, 0.12)
             + veinCol * (0.48 + energy * 0.38)
             + rimCol  * fresnel * (0.25 + u_intensity * 0.18)
             + vec3(0.0, 0.10, 0.50) * wave
             + vec3(0.0, 0.05, 0.30) * abs(vDisplace) * 2.5;
    gl_FragColor = vec4(col, 0.88 + fresnel * 0.12);
  }
`

const VERT_SHARED = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG_HOLOFIELD = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_alertFactor;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV  = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.5);
    float alertPulse = u_alertFactor * (sin(u_time * 3.5) * 0.5 + 0.5) * 0.06;
    float alpha = fresnel * (0.035 + u_intensity * 0.04) + alertPulse;
    vec3 col = mix(vec3(0.04, 0.22, 0.88), vec3(0.75, 0.06, 0.02), u_alertFactor * 0.5)
             + vec3(0.25, 0.45, 1.0) * fresnel * 0.6;
    gl_FragColor = vec4(col, alpha);
  }
`

// ─── Core Components ──────────────────────────────────────────────────────────

interface CoreProps { intensity: number; alertFactor: number; speed: number; paused: boolean }

function SovereignConsciousness({ intensity, alertFactor, speed, paused }: CoreProps) {
  const ref = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(() => ({
    u_time:        { value: 0 },
    u_intensity:   { value: intensity },
    u_alertFactor: { value: alertFactor },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useFrame(({ clock }) => {
    if (!ref.current || paused) return
    const mat = ref.current.material as THREE.ShaderMaterial
    const t = clock.getElapsedTime() * speed
    mat.uniforms.u_time.value        = t
    mat.uniforms.u_intensity.value   = intensity
    mat.uniforms.u_alertFactor.value = alertFactor
    ref.current.rotation.x = t * 0.018
    ref.current.rotation.y = t * 0.032
    ref.current.rotation.z = Math.sin(t * 0.011) * 0.04
  })

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.44, 4]} />
      <shaderMaterial vertexShader={VERT_CONSCIOUSNESS} fragmentShader={FRAG_CONSCIOUSNESS} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
  )
}

function InnerNucleus({ intensity, alertFactor, speed, paused }: CoreProps) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || paused) return
    const t = clock.getElapsedTime()
    ref.current.scale.setScalar(1.0 + 0.18 * Math.sin(t * (3.5 + intensity * 2.2) * speed) * intensity)
    const mat = ref.current.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 3.5 + 1.5 * Math.sin(t * 2.8 * speed) * intensity
    mat.emissive.setHex(alertFactor > 0.1 ? 0xFF2200 : 0x0055FF)
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.14, 2]} />
      <meshStandardMaterial color={0x001A66} emissive={0x0055FF} emissiveIntensity={3.5} metalness={0.6} roughness={0.1} transparent depthWrite={false} />
    </mesh>
  )
}

function HolographicField({ intensity, alertFactor, speed, paused }: CoreProps) {
  const ref = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(() => ({
    u_time:        { value: 0 },
    u_intensity:   { value: intensity },
    u_alertFactor: { value: alertFactor },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useFrame(({ clock }) => {
    if (!ref.current || paused) return
    const mat = ref.current.material as THREE.ShaderMaterial
    const t = clock.getElapsedTime() * speed
    mat.uniforms.u_time.value        = t
    mat.uniforms.u_intensity.value   = intensity
    mat.uniforms.u_alertFactor.value = alertFactor
    ref.current.rotation.y = t * 0.014
    ref.current.rotation.x = Math.sin(t * 0.009) * 0.03
  })

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.85, 2]} />
      <shaderMaterial vertexShader={VERT_SHARED} fragmentShader={FRAG_HOLOFIELD} uniforms={uniforms} transparent depthWrite={false} side={THREE.BackSide} />
    </mesh>
  )
}

// ─── Crystal Shards ───────────────────────────────────────────────────────────

type V3 = [number, number, number]
const SHARDS: Array<{ pos:V3; rot:V3; sc:V3; oct:boolean; op:number; em:number; ei:number }> = [
  { pos:[0.22,0.55,-0.08],  rot:[0.1,0.4,0.0],   sc:[0.14,0.55,0.14], oct:true,  op:0.72, em:0x001144, ei:0.4  },
  { pos:[-0.28,0.42,0.15],  rot:[-0.15,-0.6,0.2], sc:[0.12,0.44,0.12], oct:true,  op:0.62, em:0x000D33, ei:0.3  },
  { pos:[0.52,-0.12,0.18],  rot:[0.8,1.2,0.4],   sc:[0.38,0.18,0.28], oct:false, op:0.55, em:0x001133, ei:0.25 },
  { pos:[-0.50,0.08,-0.14], rot:[0.3,-0.8,-0.3],  sc:[0.11,0.40,0.11], oct:true,  op:0.60, em:0x000D33, ei:0.3  },
  { pos:[0.1,-0.45,0.40],   rot:[-0.6,0.5,0.8],   sc:[0.28,0.16,0.22], oct:false, op:0.50, em:0x001133, ei:0.2  },
  { pos:[-0.15,0.38,-0.38], rot:[0.4,1.6,-0.2],   sc:[0.10,0.38,0.10], oct:true,  op:0.45, em:0x000D33, ei:0.2  },
  { pos:[0.06,0.68,0.22],   rot:[0.0,0.3,0.1],    sc:[0.08,0.28,0.08], oct:true,  op:0.80, em:0x002266, ei:0.6  },
  { pos:[-0.2,-0.38,-0.35], rot:[0.9,2.2,0.5],    sc:[0.30,0.14,0.24], oct:false, op:0.42, em:0x000D33, ei:0.15 },
  { pos:[0.40,0.30,0.32],   rot:[-0.2,0.9,0.35],  sc:[0.09,0.24,0.09], oct:true,  op:0.68, em:0x001A44, ei:0.35 },
]

function CrystalArchitecture({ intensity, paused }: { intensity: number; paused: boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const geos = useMemo(() => SHARDS.map(c => c.oct ? new THREE.OctahedronGeometry(1,0) : new THREE.TetrahedronGeometry(1,0)), [])

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime()
    refs.current.forEach((m, i) => {
      if (!m) return
      const mat = m.material as THREE.MeshPhysicalMaterial
      mat.emissiveIntensity = SHARDS[i].ei * (1 + 0.4 * Math.sin(t * 0.8 + i * 0.9) * intensity)
    })
  })

  return (
    <group>
      {SHARDS.map((c, i) => (
        <mesh key={i} ref={el => { refs.current[i] = el }} geometry={geos[i]} position={c.pos} rotation={c.rot} scale={c.sc}>
          <meshPhysicalMaterial color={0x020C22} emissive={c.em} emissiveIntensity={c.ei} metalness={0.88} roughness={0.14} transmission={0.12} thickness={0.4} transparent opacity={c.op} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Neural Filament Bundles ──────────────────────────────────────────────────

function randF(s: number): number { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x) }

function buildBundle(dir: THREE.Vector3, count: number, seed: number): THREE.BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => {
    const off = new THREE.Vector3((randF(seed+i*3)-0.5)*0.22, (randF(seed+i*3+1)-0.5)*0.22, (randF(seed+i*3+2)-0.5)*0.22)
    const d   = dir.clone().add(off).normalize()
    const start = d.clone().multiplyScalar(0.40 + randF(seed+i)*0.06)
    const p1 = start.clone().add(d.clone().multiplyScalar(0.5+randF(seed+i+10)*0.2)).add(new THREE.Vector3((randF(seed+i+20)-0.5)*0.14,(randF(seed+i+21)-0.5)*0.14,(randF(seed+i+22)-0.5)*0.14))
    const p2 = start.clone().add(d.clone().multiplyScalar(0.9+randF(seed+i+30)*0.2)).add(new THREE.Vector3((randF(seed+i+40)-0.5)*0.10,(randF(seed+i+41)-0.5)*0.10,(randF(seed+i+42)-0.5)*0.10))
    const tip = d.clone().multiplyScalar(1.45 + randF(seed+i+50)*0.25)
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start,p1,p2,tip]), 14, 0.006+randF(seed+i+60)*0.008, 4, false)
  })
}

function NeuralBundles({ intensity, alertFactor, paused }: CoreProps) {
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const bundles = useMemo(() => {
    const dirs = [
      new THREE.Vector3(1,0.3,0), new THREE.Vector3(-0.5,0.9,0.2),
      new THREE.Vector3(-0.8,-0.1,0.6), new THREE.Vector3(0.2,-0.7,-0.7),
      new THREE.Vector3(0.6,0.4,-0.7), new THREE.Vector3(-0.3,-0.9,-0.3),
    ].map(d => d.normalize())
    return dirs.flatMap((dir, bi) =>
      buildBundle(dir, 3, bi*100).map((geo, fi) => ({ geo, phase: bi*1.05+fi*0.37, speed: 0.7+(bi+fi)*0.08 }))
    )
  }, [])

  useFrame(({ clock }) => {
    if (paused) return
    const t = clock.getElapsedTime()
    mats.current.forEach((mat, i) => {
      if (!mat) return
      mat.opacity = 0.10 + 0.30 * Math.abs(Math.sin(t * bundles[i].speed + bundles[i].phase)) * intensity
      mat.color.setHex(alertFactor > 0.5 ? 0xCC2200 : 0x0077FF)
    })
  })

  return (
    <group>
      {bundles.map(({ geo }, i) => (
        <mesh key={i} geometry={geo}>
          <meshBasicMaterial ref={el => { mats.current[i] = el as THREE.MeshBasicMaterial | null }} color={0x0077FF} transparent opacity={0.14} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Star Field ───────────────────────────────────────────────────────────────

function StarField() {
  const { positions, colors } = useMemo(() => {
    const N = 2200; const positions = new Float32Array(N*3); const colors = new Float32Array(N*3)
    for (let i = 0; i < N; i++) {
      const r = 70+Math.random()*80, th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1)
      positions[i*3]=r*Math.sin(ph)*Math.cos(th); positions[i*3+1]=r*Math.cos(ph); positions[i*3+2]=r*Math.sin(ph)*Math.sin(th)
      const k=0.18+Math.random()*0.82; colors[i*3]=k*0.50; colors[i*3+1]=k*0.62; colors[i*3+2]=k
    }
    return { positions, colors }
  }, [])
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={positions.length/3} itemSize={3} />
        <bufferAttribute attach="attributes-color"    array={colors}    count={colors.length/3}    itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.11} vertexColors transparent opacity={0.85} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

// ─── Orbital Agents ───────────────────────────────────────────────────────────

function agentPos(a: AgentConfig, T: number): THREE.Vector3 {
  const inc = a.inc * Math.PI/180, lng = a.lng * Math.PI/180
  const angle = T * a.orbitSpd
  const x0 = Math.cos(angle) * a.orbitR, z0 = Math.sin(angle) * a.orbitR
  return new THREE.Vector3(
    x0*Math.cos(lng) - z0*Math.sin(inc)*Math.sin(lng),
    z0*Math.sin(inc),
    x0*Math.sin(lng) + z0*Math.cos(inc)*Math.cos(lng),
  )
}

function makeAgentGeo(id: string): THREE.BufferGeometry {
  switch (id) {
    case 'charon':     return new THREE.CylinderGeometry(0.38,0.38,0.10,6,1)
    case 'persephone': return new THREE.ConeGeometry(0.30,0.58,8,1)
    case 'minos':      return new THREE.BoxGeometry(0.48,0.48,0.48)
    case 'cerberus':   return new THREE.CylinderGeometry(0.22,0.28,0.60,6,1)
    case 'elysium':    return new THREE.IcosahedronGeometry(0.36,1)
    case 'tartarus':   return new THREE.TorusKnotGeometry(0.24,0.09,72,8,2,7)
    default:           return new THREE.OctahedronGeometry(0.32,0)
  }
}

interface AgentProps {
  agent:      AgentConfig
  intensity:  number
  alertFactor:number
  speed:      number
  paused:     boolean
  isSelected: boolean
  onSelect:   (id: string) => void
  groupRef:   React.MutableRefObject<THREE.Group | null>
}

function OrbitalAgent({ agent, intensity, alertFactor, speed, paused, isSelected, onSelect, groupRef }: AgentProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => makeAgentGeo(agent.id), [agent.id])
  const isAlert = agent.status === 'alert' || (agent.id === 'cerberus' && alertFactor > 0.5) || (agent.id === 'tartarus' && alertFactor > 0.5)

  useFrame(({ clock }) => {
    if (!groupRef.current || !meshRef.current || paused) return
    const t = clock.getElapsedTime()
    groupRef.current.position.copy(agentPos(agent, t * speed))
    const rotDir = (agent.id === 'charon' || agent.id === 'minos') ? 1 : -1
    meshRef.current.rotation.x = t * 0.35 * rotDir
    meshRef.current.rotation.y = t * 0.55 * (agent.id === 'elysium' ? 1.2 : -0.9)
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = isAlert ? 1.6+0.8*Math.sin(t*4.5) : 1.2+0.5*Math.sin(t*1.4+agent.lng)*intensity
    if (haloRef.current) {
      const h = haloRef.current.material as THREE.MeshBasicMaterial
      h.opacity = isSelected ? 0.12 : 0.04 + 0.04*Math.sin(t*1.8+agent.lng)*intensity
    }
  })

  const statusColor = agent.status === 'active' ? '#00FF88' : agent.status === 'standby' ? '#C9A84C' : '#FF3333'

  return (
    <group
      ref={groupRef as React.Ref<THREE.Group>}
      onClick={() => onSelect(agent.id)}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <mesh ref={meshRef} geometry={geo}>
        <meshStandardMaterial color={agent.darkCol} emissive={agent.glowCol} emissiveIntensity={1.2} metalness={0.92} roughness={0.08} />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.68,12,12]} />
        <meshBasicMaterial color={agent.glowCol} transparent opacity={0.04} depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0.42,0.42,0]}>
        <sphereGeometry args={[0.055,6,6]} />
        <meshBasicMaterial color={statusColor} blending={THREE.AdditiveBlending} />
      </mesh>
      <Html center distanceFactor={8} style={{ pointerEvents:'none', whiteSpace:'nowrap' }} position={[0,0.85,0]}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
          <div style={{ fontSize:'8px', letterSpacing:'0.2em', fontWeight:600, color:'rgba(232,244,255,0.80)', background:'rgba(1,2,8,0.70)', padding:'2px 7px', borderRadius:'2px', backdropFilter:'blur(4px)', fontFamily:'"Inter", system-ui, sans-serif' }}>{agent.name}</div>
          <div style={{ width:'3px', height:'3px', borderRadius:'50%', background:statusColor, boxShadow:`0 0 4px ${statusColor}` }} />
        </div>
      </Html>
    </group>
  )
}

// ─── Connection Arcs ──────────────────────────────────────────────────────────

const CONN_SEGS = 28
const FLOW_N    = 12
const ORIGIN    = new THREE.Vector3(0,0,0)

function bezierPt(P0: THREE.Vector3, P1: THREE.Vector3, P2: THREE.Vector3, t: number): THREE.Vector3 {
  const om = 1-t
  return new THREE.Vector3(
    om*om*P0.x+2*om*t*P1.x+t*t*P2.x,
    om*om*P0.y+2*om*t*P1.y+t*t*P2.y,
    om*om*P0.z+2*om*t*P1.z+t*t*P2.z,
  )
}

interface ConnectionLinesProps {
  agentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>
  intensity:      number
  alertFactor:    number
  speed:          number
  paused:         boolean
  visible:        boolean
  selectedId:     string | null
}

function ConnectionLines({ agentGroupRefs, intensity, alertFactor, speed, paused, visible, selectedId }: ConnectionLinesProps) {
  const { geos, flowGeos, lineMats, flowOffsets } = useMemo(() => {
    const geos      = AGENTS.map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONN_SEGS+1)*3),3)); return g })
    const flowGeos  = AGENTS.map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLOW_N*3),3)); return g })
    const lineMats  = AGENTS.map(a => new THREE.LineBasicMaterial({ color: a.glowCol, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }))
    const flowOffsets = AGENTS.map(() => Array.from({ length: FLOW_N }, (_, i) => i/FLOW_N))
    return { geos, flowGeos, lineMats, flowOffsets }
  }, [])

  const lineObjects = useMemo(
    () => AGENTS.map((_, i) => new THREE.Line(geos[i], lineMats[i])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const pointRefs = useRef<(THREE.Points | null)[]>([])

  useFrame(({ clock }) => {
    if (paused || !visible) return
    const T = clock.getElapsedTime() * speed
    AGENTS.forEach((agent, i) => {
      const grp = agentGroupRefs.current[i]
      if (!grp) return
      const aPos = grp.position
      const ctrl = aPos.clone().multiplyScalar(0.5); ctrl.y += 2.0
      const lineArr = geos[i].attributes.position.array as Float32Array
      for (let s = 0; s <= CONN_SEGS; s++) {
        const pt = bezierPt(ORIGIN, ctrl, aPos, s/CONN_SEGS)
        lineArr[s*3]=pt.x; lineArr[s*3+1]=pt.y; lineArr[s*3+2]=pt.z
      }
      geos[i].attributes.position.needsUpdate = true
      lineMats[i].opacity = selectedId === agent.id ? 0.52 : 0.12 + intensity * 0.08
      if (alertFactor > 0.5) lineMats[i].color.setHex(0xFF3300)
      else lineMats[i].color.copy(agent.glowCol)
      const flowArr = flowGeos[i].attributes.position.array as Float32Array
      flowOffsets[i].forEach((offset, j) => {
        const tv = ((offset + T*0.14*agent.orbitSpd*5) % 1.0)
        const pt = bezierPt(ORIGIN, ctrl, aPos, tv)
        flowArr[j*3]=pt.x; flowArr[j*3+1]=pt.y; flowArr[j*3+2]=pt.z
      })
      flowGeos[i].attributes.position.needsUpdate = true
    })
  })

  if (!visible) return null

  return (
    <group>
      {AGENTS.map((agent, i) => (
        <group key={agent.id}>
          <primitive object={lineObjects[i]} />
          <points ref={el => { pointRefs.current[i] = el }} geometry={flowGeos[i]}>
            <pointsMaterial color={agent.glowCol} size={0.065} transparent opacity={0.80} depthWrite={false} sizeAttenuation blending={THREE.AdditiveBlending} />
          </points>
        </group>
      ))}
    </group>
  )
}

// ─── Agent Info Panel ─────────────────────────────────────────────────────────

const METRICS: Record<string, Array<{ lbl: string; val: string; fill: number }>> = {
  charon:     [{ lbl:'REQUESTS', val:'1.2K/s', fill:72}, { lbl:'LATENCY', val:'12ms',  fill:60}, { lbl:'UPTIME',  val:'99.9%', fill:99}],
  persephone: [{ lbl:'BALANCE',  val:'$48.2K', fill:68}, { lbl:'PENDING', val:'$3.1K', fill:28}, { lbl:'BURNS',   val:'14',    fill:14}],
  minos:      [{ lbl:'PENDING',  val:'3',      fill:30}, { lbl:'APPROVED',val:'340',   fill:99}, { lbl:'ACC.',    val:'99.8%', fill:99}],
  cerberus:   [{ lbl:'THREATS',  val:'0',      fill:0 }, { lbl:'BLOCKS/H',val:'47',    fill:47}, { lbl:'RULES',   val:'128',   fill:50}],
  elysium:    [{ lbl:'TASKS',    val:'7',      fill:70}, { lbl:'ON TIME', val:'100%',  fill:100},{ lbl:'SCORE',   val:'9.4',   fill:94}],
  tartarus:   [{ lbl:'QUEUE',    val:'1.8K',   fill:85}, { lbl:'DEPTH',   val:'L-7',   fill:70}, { lbl:'ETA',     val:'14m',   fill:30}],
}

function AgentInfoPanel({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  const metrics = METRICS[agent.id] ?? []
  const statusColor = agent.status === 'active' ? '#00FF88' : agent.status === 'standby' ? '#C9A84C' : '#FF3333'
  const glowHex = `#${agent.glowCol.getHexString()}`

  return (
    <Html center distanceFactor={6} style={{ pointerEvents:'none' }} position={[2.2,0.5,0]}>
      <div style={{ background:'rgba(1,4,14,0.94)', border:`1px solid ${glowHex}4C`, borderRadius:'8px', width:'220px', backdropFilter:'blur(20px)', pointerEvents:'auto', overflow:'hidden' }}>
        <div style={{ height:'2px', background:glowHex }} />
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid rgba(0,153,255,0.12)', display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ width:'26px', height:'26px', borderRadius:'5px', background:`${glowHex}22`, color:glowHex, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, flexShrink:0, fontFamily:'"Inter", sans-serif' }}>{agent.symbol}</div>
          <div style={{ flex:1, fontSize:'11px', fontWeight:700, letterSpacing:'0.1em', color:'#E8F4FF', fontFamily:'"Inter", sans-serif' }}>{agent.name}</div>
          <div style={{ fontSize:'7px', letterSpacing:'0.12em', padding:'2px 6px', borderRadius:'8px', background:`${statusColor}18`, color:statusColor, border:`1px solid ${statusColor}44`, fontFamily:'"Inter", sans-serif' }}>{agent.status.toUpperCase()}</div>
          <button onClick={onClose} style={{ width:'18px', height:'18px', border:'1px solid rgba(232,244,255,0.2)', borderRadius:'3px', background:'transparent', color:'rgba(232,244,255,0.5)', cursor:'pointer', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'auto', flexShrink:0 }}>✕</button>
        </div>
        <div style={{ padding:'8px 12px 12px' }}>
          <div style={{ fontSize:'8px', letterSpacing:'0.2em', color:`${glowHex}CC`, textTransform:'uppercase', marginBottom:'4px', fontFamily:'"Inter", sans-serif' }}>{agent.role}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'5px' }}>
            {metrics.map(m => (
              <div key={m.lbl} style={{ background:'rgba(0,85,255,0.06)', border:'1px solid rgba(0,153,255,0.10)', borderRadius:'4px', padding:'5px', textAlign:'center' }}>
                <div style={{ fontSize:'11px', fontWeight:600, color:glowHex, fontFamily:'"Inter", sans-serif', fontVariantNumeric:'tabular-nums' }}>{m.val}</div>
                <div style={{ fontSize:'7px', color:'rgba(232,244,255,0.38)', letterSpacing:'0.1em', marginTop:'1px', fontFamily:'"Inter", sans-serif' }}>{m.lbl}</div>
                <div style={{ height:'2px', background:'rgba(232,244,255,0.08)', borderRadius:'1px', marginTop:'4px', overflow:'hidden' }}>
                  <div style={{ width:`${m.fill}%`, height:'100%', background:glowHex, borderRadius:'1px' }} />
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
  state:           SovereignState
  paused:          boolean
  showConnections: boolean
  reducedMotion:   boolean
  onAgentSelect?:  (name: string) => void
}

function SovereignScene({ state, paused, showConnections, reducedMotion, onAgentSelect }: SceneProps) {
  const p     = STATE_PARAMS[state]
  const speed = reducedMotion ? p.speed * 0.35 : p.speed

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const agentGroupRefs = useRef<(THREE.Group | null)[]>(Array(AGENTS.length).fill(null))
  const agentRefs      = useMemo(() => AGENTS.map(() => ({ current: null as THREE.Group | null })), [])

  const coreLight = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    AGENTS.forEach((_, i) => { agentGroupRefs.current[i] = agentRefs[i].current })
    if (!coreLight.current || paused) return
    const t = clock.getElapsedTime()
    const base = p.intensity * 2.0
    coreLight.current.intensity = base + Math.sin(t * 2.6 * speed) * base * 0.22
    coreLight.current.color.setHex(p.alertFactor > 0 ? 0xFF2200 : 0x0044FF)
  })

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
    const a = AGENTS.find(a => a.id === id)
    if (a) onAgentSelect?.(a.name)
  }, [onAgentSelect])

  const selectedAgent = AGENTS.find(a => a.id === selectedId) ?? null

  return (
    <>
      <ambientLight intensity={0.04} color="#030A18" />
      <pointLight ref={coreLight} position={[0,0,0]} color="#0044FF" intensity={2.0} distance={7} decay={2} />
      <pointLight position={[0,4,3]}   color="#001A44" intensity={0.9} decay={2} />
      <pointLight position={[-3,-1,2]} color="#000C22" intensity={0.6} decay={2} />
      <pointLight position={[2,3,-4]}  color="#0A0518" intensity={0.4} decay={2} />

      <StarField />
      <InnerNucleus           intensity={p.intensity} alertFactor={p.alertFactor} speed={speed} paused={paused} />
      <SovereignConsciousness intensity={p.intensity} alertFactor={p.alertFactor} speed={speed} paused={paused} />
      <CrystalArchitecture    intensity={p.intensity} paused={paused} />
      <NeuralBundles          intensity={p.intensity} alertFactor={p.alertFactor} speed={speed} paused={paused} />
      <HolographicField       intensity={p.intensity} alertFactor={p.alertFactor} speed={speed} paused={paused} />

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

      <ConnectionLines
        agentGroupRefs={agentGroupRefs}
        intensity={p.intensity}
        alertFactor={p.alertFactor}
        speed={speed}
        paused={paused}
        visible={showConnections}
        selectedId={selectedId}
      />

      {selectedAgent && (
        <AgentInfoPanel agent={selectedAgent} onClose={() => setSelectedId(null)} />
      )}

      <EffectComposer>
        <Bloom intensity={p.bloom} luminanceThreshold={0.60} luminanceSmoothing={0.08} radius={0.65} mipmapBlur />
        <Vignette eskil={false} offset={0.15} darkness={0.65} />
      </EffectComposer>
    </>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SovereignCoreProps {
  state?:           SovereignState
  paused?:          boolean
  showConnections?: boolean
  reducedMotion?:   boolean
  onAgentSelect?:   (name: string) => void
  style?:           CSSProperties
  className?:       string
}

export default function SovereignCore({
  state           = 'IDLE',
  paused          = false,
  showConnections = true,
  reducedMotion   = false,
  onAgentSelect,
  style,
  className,
}: SovereignCoreProps): JSX.Element {
  return (
    <Canvas
      camera={{ position: [0, 2.5, 9.5], fov: 52 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{ background: 'transparent', ...style }}
      className={className}
    >
      <AdaptiveDpr pixelated />
      <OrbitControls enableDamping dampingFactor={0.06} minDistance={5} maxDistance={22} autoRotate={!paused} autoRotateSpeed={0.20} enablePan={false} />
      <SovereignScene state={state} paused={paused} showConnections={showConnections} reducedMotion={reducedMotion} onAgentSelect={onAgentSelect} />
    </Canvas>
  )
}
