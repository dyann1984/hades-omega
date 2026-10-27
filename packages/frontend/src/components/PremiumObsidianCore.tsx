/**
 * PremiumObsidianCore — Núcleo Obsidiana Cristalina
 *
 * Basado en referencia visual aprobada:
 * - Estructura cristalina obsidiana compleja, multifacética
 * - Luz azul brillante desde el interior
 * - Seis agentes como réplicas más pequeñas
 * - Plataforma metálica circular
 * - Conexiones de energía azul eléctrico
 *
 * Técnica: Geometría PBR procedimental avanzada (sin GLB externo)
 * - Materiales PBR con transmission, roughness variable
 * - Shaders GLSL custom para emisión interna
 * - Geometría compuesta de fragmentos cristalinos angulares
 * - Post-processing Bloom para glow
 */

import { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, AdaptiveDpr } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ─── State System ─────────────────────────────────────────────────────────────

export type CoreState = 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ALERT' | 'COMPLETED'

interface StateParams {
  intensity: number
  alertFactor: number
  speed: number
  bloom: number
}

const STATE_PARAMS: Record<CoreState, StateParams> = {
  IDLE:      { intensity: 0.35, alertFactor: 0,   speed: 0.50, bloom: 0.30 },
  THINKING:  { intensity: 0.65, alertFactor: 0,   speed: 0.85, bloom: 0.50 },
  EXECUTING: { intensity: 1.00, alertFactor: 0,   speed: 1.20, bloom: 0.70 },
  WAITING:   { intensity: 0.25, alertFactor: 0,   speed: 0.35, bloom: 0.20 },
  ALERT:     { intensity: 0.90, alertFactor: 1.0, speed: 1.10, bloom: 0.80 },
  COMPLETED: { intensity: 0.55, alertFactor: 0,   speed: 0.65, bloom: 0.40 },
}

// ─── Agent Config ─────────────────────────────────────────────────────────────

interface AgentCfg {
  id:        string
  name:      string
  role:      string
  position:  [number, number, number]
  accentHex: number
  status:    'active' | 'standby' | 'alert'
}

// Posiciones radiales alrededor del núcleo central
// R = 2.5, dispuestas en círculo con variación de altura para profundidad 3D
export const AGENTS: AgentCfg[] = [
  { id:'cerberus',   name:'CERBERUS',   role:'Seguridad & Políticas',      position:[ 0.00,  0.30,-2.50], accentHex:0xCC3318, status:'active'  },
  { id:'minos',      name:'MINOS',      role:'Validación & Aprobaciones',  position:[ 2.16,  0.15,-1.25], accentHex:0xBB9A18, status:'active'  },
  { id:'persephone', name:'PERSEPHONE', role:'Finanzas & Presupuesto',     position:[ 2.16, -0.15, 1.25], accentHex:0x00AA88, status:'active'  },
  { id:'charon',     name:'CHARON',     role:'Compras & Proveedores',      position:[ 0.00, -0.30, 2.50], accentHex:0x1488BB, status:'active'  },
  { id:'elysium',    name:'ELYSIUM',    role:'Planificación & Resultados', position:[-2.16, -0.15, 1.25], accentHex:0x5577CC, status:'active'  },
  { id:'tartarus',   name:'TARTARUS',   role:'Anomalías & Contención',     position:[-2.16,  0.15,-1.25], accentHex:0x7722BB, status:'alert'   },
]

// ─── GLSL Shaders ─────────────────────────────────────────────────────────────

// Vertex shader para cristal obsidiana con displazamiento sutil
const VERT_CRYSTAL = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDisplace;
  void main() {
    float t = u_time;
    // Displazamiento sutil basado en ruido simple
    float n1 = sin(position.y * 6.0 + t * 0.4) * cos(position.z * 5.0 - t * 0.3) * 0.06;
    float n2 = sin(position.z * 7.0 + t * 0.25) * cos(position.x * 6.0 + t * 0.2) * 0.05;
    float d = (n1 + n2) * (1.0 + u_intensity * 0.3);
    vec3 displaced = position * (1.0 + d);
    vDisplace = d;
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

// Fragment shader para emisión interna azul pulsante
const FRAG_CRYSTAL = /* glsl */`
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_alertFactor;
  uniform vec3 u_baseColor;
  uniform vec3 u_emissiveColor;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDisplace;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV  = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.0);

    // Patrón de energía interna
    float phi   = atan(vWorldPos.z, vWorldPos.x);
    float energy = sin(phi * 8.0 + u_time * 2.0) * cos(vWorldPos.y * 6.0 - u_time * 1.5);
    energy = (energy * 0.5 + 0.5) * u_intensity;

    // Color base obsidiana con emisión
    vec3 baseCol = u_baseColor;
    vec3 emitCol = mix(u_emissiveColor, vec3(1.0, 0.1, 0.05), u_alertFactor);
    vec3 col = baseCol + emitCol * (0.3 + energy * 0.5) + vec3(0.1, 0.4, 1.0) * fresnel * 0.3;

    // Opacidad basada en fresnel para efecto cristal
    float alpha = 0.7 + fresnel * 0.3 + u_intensity * 0.1;

    gl_FragColor = vec4(col, alpha);
  }
`

// ─── Crystal Shard Component ──────────────────────────────────────────────────

interface CrystalShardProps {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  baseColor: number
  emissiveColor: number
  intensity: number
  alertFactor: number
  speed: number
  paused: boolean
}

function CrystalShard({
  position, rotation, scale, baseColor, emissiveColor,
  intensity, alertFactor, speed, paused
}: CrystalShardProps) {
  const ref = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(() => ({
    u_time:        { value: 0 },
    u_intensity:   { value: intensity },
    u_alertFactor: { value: alertFactor },
    u_baseColor:   { value: new THREE.Color(baseColor) },
    u_emissiveColor: { value: new THREE.Color(emissiveColor) },
  }), [intensity, alertFactor, baseColor, emissiveColor])

  useFrame(({ clock }) => {
    if (!ref.current || paused) return
    const mat = ref.current.material as THREE.ShaderMaterial
    const t = clock.getElapsedTime() * speed
    mat.uniforms.u_time.value = t
    mat.uniforms.u_intensity.value = intensity
    mat.uniforms.u_alertFactor.value = alertFactor
  })

  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale}>
      <octahedronGeometry args={[1, 0]} />
      <shaderMaterial
        vertexShader={VERT_CRYSTAL}
        fragmentShader={FRAG_CRYSTAL}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ─── Central Obsidian Core ───────────────────────────────────────────────────

interface CoreProps {
  intensity: number
  alertFactor: number
  speed: number
  paused: boolean
}

function CentralObsidianCore({ intensity, alertFactor, speed, paused }: CoreProps) {
  const groupRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  // Geometría compuesta del núcleo central
  // Múltiples fragmentos cristalinos superpuestos para efecto complejo
  const shards = useMemo(() => [
    // Fragmento central principal
    { pos:[0,0,0], rot:[0,0,0], sc:[0.8,0.6,0.8], base:0x020814, emit:0x0044CC },
    // Fragmentos orbitales internos
    { pos:[0.3,0.2,0.15], rot:[0.4,0.8,0.1], sc:[0.3,0.4,0.25], base:0x030A18, emit:0x0055DD },
    { pos:[-0.25,0.15,-0.2], rot:[-0.3,-0.6,0.2], sc:[0.25,0.35,0.2], base:0x030A18, emit:0x0055DD },
    { pos:[0.15,-0.25,0.2], rot:[0.5,0.4,-0.3], sc:[0.2,0.3,0.18], base:0x020814, emit:0x0044CC },
    { pos:[-0.15,-0.1,-0.25], rot:[-0.4,0.7,0.15], sc:[0.22,0.32,0.2], base:0x030A18, emit:0x0055DD },
    // Fragmentos exteriores más pequeños
    { pos:[0.45,0.3,0.25], rot:[0.6,1.0,0.4], sc:[0.15,0.22,0.16], base:0x020814, emit:0x0033AA },
    { pos:[-0.4,0.25,-0.3], rot:[-0.5,-0.8,-0.2], sc:[0.14,0.2,0.15], base:0x020814, emit:0x0033AA },
    { pos:[0.25,-0.35,0.3], rot:[0.7,0.6,0.5], sc:[0.12,0.18,0.14], base:0x020814, emit:0x0033AA },
    { pos:[-0.3,-0.2,-0.35], rot:[-0.6,0.9,-0.3], sc:[0.13,0.19,0.15], base:0x020814, emit:0x0033AA },
  ], [])

  useFrame(({ clock }) => {
    if (!groupRef.current || paused) return
    const t = clock.getElapsedTime() * speed
    // Rotación lenta dignificada
    groupRef.current.rotation.y += 0.001 * speed
    groupRef.current.rotation.x = Math.sin(t * 0.08) * 0.05

    if (lightRef.current) {
      const pulse = Math.sin(t * 2.0) * 0.2 + 0.8
      lightRef.current.intensity = (2.0 + intensity) * pulse
      lightRef.current.color.setHex(alertFactor > 0.5 ? 0xFF2200 : 0x0055CC)
    }
  })

  return (
    <group ref={groupRef}>
      {/* Fragmentos cristalinos */}
      {shards.map((s, i) => (
        <CrystalShard
          key={i}
          position={s.pos as [number, number, number]}
          rotation={s.rot as [number, number, number]}
          scale={s.sc as [number, number, number]}
          baseColor={s.base}
          emissiveColor={s.emit}
          intensity={intensity}
          alertFactor={alertFactor}
          speed={speed}
          paused={paused}
        />
      ))}

      {/* Luz interna */}
      <pointLight ref={lightRef} color={0x0055CC} intensity={2.0} distance={6.0} decay={2} />

      {/* Núcleo brillante central */}
      <mesh>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshBasicMaterial
          color={alertFactor > 0.5 ? 0xFF3300 : 0x0088FF}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

// ─── Metallic Platform ───────────────────────────────────────────────────────

function MetallicPlatform({ intensity, speed, paused }: { intensity: number; speed: number; paused: boolean }) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ref.current || paused) return
    const t = clock.getElapsedTime() * speed
    ref.current.rotation.y = t * 0.02
  })

  return (
    <group>
      {/* Plataforma principal */}
      <mesh ref={ref} rotation-x={-Math.PI / 2}>
        <cylinderGeometry args={[3.5, 3.8, 0.08, 64]} />
        <meshStandardMaterial
          color={0x0A0A12}
          metalness={0.95}
          roughness={0.15}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Anillo luminoso externo */}
      <mesh rotation-x={-Math.PI / 2}>
        <torusGeometry args={[3.2, 0.02, 4, 100]} />
        <meshBasicMaterial
          color={0x0066CC}
          transparent
          opacity={0.4 + 0.2 * intensity}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Patrones de energía en la plataforma */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[1.5, 1.6, 32]} />
        <meshBasicMaterial
          color={0x0055BB}
          transparent
          opacity={0.3 * intensity}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[2.2, 2.3, 32]} />
        <meshBasicMaterial
          color={0x0055BB}
          transparent
          opacity={0.25 * intensity}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

// ─── Agent Node (Replica del núcleo) ─────────────────────────────────────────

interface AgentNodeProps {
  agent: AgentCfg
  intensity: number
  speed: number
  paused: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}

function AgentNode({ agent, intensity, speed, paused, isSelected, onSelect }: AgentNodeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const isAlert = agent.status === 'alert'
  const accentStr = '#' + agent.accentHex.toString(16).padStart(6, '0')

  useFrame(({ clock }) => {
    if (!groupRef.current || paused) return
    const t = clock.getElapsedTime() * speed
    // Rotación lenta individual
    groupRef.current.rotation.y += 0.002 * speed
    // Pulsación sutil
    const s = 1.0 + 0.03 * Math.sin(t * 1.5) * intensity
    groupRef.current.scale.setScalar(s)
  })

  return (
    <group
      position={agent.position}
      onClick={(e) => { e.stopPropagation(); onSelect(agent.id) }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <group ref={groupRef}>
        {/* Estructura cristalina del agente (versión simplificada del núcleo) */}
        <CrystalShard
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          scale={[0.35, 0.5, 0.35]}
          baseColor={0x020814}
          emissiveColor={isAlert ? 0xFF2200 : agent.accentHex}
          intensity={intensity}
          alertFactor={isAlert ? 1.0 : 0}
          speed={speed}
          paused={paused}
        />

        {/* Luz interna del agente */}
        <pointLight
          color={isAlert ? 0xFF3300 : agent.accentHex}
          intensity={0.8}
          distance={1.5}
          decay={2}
        />

        {/* Indicador de selección */}
        {isSelected && (
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.5, 0.008, 4, 32]} />
            <meshBasicMaterial
              color={agent.accentHex}
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}
      </group>

      {/* Label HTML */}
      <Html
        center
        distanceFactor={8.0}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        position={[0, 0.6, 0]}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
          background: 'rgba(2,4,14,0.88)', border: `1px solid ${accentStr}22`,
          borderRadius: '4px', padding: '4px 10px', backdropFilter: 'blur(8px)',
          boxShadow: isSelected ? `0 0 12px ${accentStr}28` : 'none',
        }}>
          <div style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.20em',
            color: isSelected ? accentStr : '#B8D4EE',
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            {agent.name}
          </div>
          <div style={{
            fontSize: '7px', letterSpacing: '0.06em',
            color: 'rgba(160,200,235,0.38)',
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            {agent.role}
          </div>
        </div>
      </Html>
    </group>
  )
}

// ─── Energy Connections ─────────────────────────────────────────────────────

interface ConnectionsProps {
  intensity: number
  alertFactor: number
  speed: number
  paused: boolean
  visible: boolean
  selectedId: string | null
}

function EnergyConnections({
  intensity, alertFactor, speed, paused, visible, selectedId,
}: ConnectionsProps) {
  const lineMats = useRef<THREE.LineBasicMaterial[]>([])
  const flowObjs = useRef<THREE.Points[]>([])
  const flowGeos = useRef<THREE.BufferGeometry[]>([])
  const flowMats = useRef<THREE.PointsMaterial[]>([])
  const flowOffsets = useRef<number[][]>([])

  const N_FLOW = 6 // Partículas de flujo por conexión

  useMemo(() => {
    lineMats.current = AGENTS.map(() => new THREE.LineBasicMaterial({
      color: 0x0066CC, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }))

    // Geometrías de flujo de partículas
    flowGeos.current = AGENTS.map(() => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLOW * 3), 3))
      return g
    })

    flowMats.current = AGENTS.map(a => new THREE.PointsMaterial({
      color: a.accentHex, size: 0.02, transparent: true, opacity: 0.8,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
    }))

    flowObjs.current = AGENTS.map((_, i) => new THREE.Points(flowGeos.current[i], flowMats.current[i]))
    flowOffsets.current = AGENTS.map(() => Array.from({ length: N_FLOW }, (_, j) => j / N_FLOW))
  }, [])

  useFrame(({ clock }) => {
    if (!visible || paused) return
    const T = clock.getElapsedTime() * speed

    AGENTS.forEach((a, i) => {
      const [ax, ay, az] = a.position
      const isAlert    = a.status === 'alert' || alertFactor > 0.5
      const isSelected = selectedId === a.id

      // Actualizar opacidad de líneas
      lineMats.current[i].opacity = isSelected
        ? 0.6
        : 0.2 + 0.1 * Math.sin(T * 0.5 + i) * intensity
      lineMats.current[i].color.setHex(
        isAlert    ? 0xAA1100 :
        isSelected ? 0x1A7AB8 : 0x0055AA,
      )

      // Actualizar flujo de partículas
      const arr = flowGeos.current[i].attributes.position.array as Float32Array
      const spd = 0.1 + i * 0.01
      flowOffsets.current[i].forEach((off, j) => {
        const t  = (off + T * spd) % 1.0
        arr[j*3]   = ax * t
        arr[j*3+1] = ay * t
        arr[j*3+2] = az * t
      })
      flowGeos.current[i].attributes.position.needsUpdate = true

      flowMats.current[i].color.setHex(isAlert ? 0xFF3300 : a.accentHex)
      flowMats.current[i].opacity = 0.6 + 0.2 * Math.sin(T * 1.0 + i * 0.8) * intensity
    })
  })

  if (!visible) return null

  return (
    <group>
      {AGENTS.map((a, i) => (
        <group key={a.id}>
          {/* Línea de conexión */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([0, 0, 0, ...a.position])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <primitive object={lineMats.current[i]} />
          </line>
          {/* Partículas de flujo */}
          <primitive object={flowObjs.current[i]} />
        </group>
      ))}
    </group>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  state: CoreState
  paused: boolean
  onAgentSelect: (id: string) => void
  style?: React.CSSProperties
}

export default function PremiumObsidianCore({ state, paused, onAgentSelect, style }: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const params = STATE_PARAMS[state]

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    onAgentSelect(id)
  }, [onAgentSelect])

  return (
    <div style={style}>
      <Canvas
        camera={{ position: [0, 4, 7], fov: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ background: 'transparent' }}
      >
        <AdaptiveDpr pixelated={false} />

        {/* Iluminación ambiental */}
        <ambientLight intensity={0.15} color="#0A1428" />
        <directionalLight position={[5, 10, 5]} intensity={0.5} color="#0066CC" />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} color="#C9A84C" />

        {/* Plataforma metálica */}
        <MetallicPlatform
          intensity={params.intensity}
          speed={params.speed}
          paused={paused}
        />

        {/* Núcleo central obsidiana */}
        <CentralObsidianCore
          intensity={params.intensity}
          alertFactor={params.alertFactor}
          speed={params.speed}
          paused={paused}
        />

        {/* Conexiones de energía */}
        <EnergyConnections
          intensity={params.intensity}
          alertFactor={params.alertFactor}
          speed={params.speed}
          paused={paused}
          visible={true}
          selectedId={selectedId}
        />

        {/* Seis agentes */}
        {AGENTS.map(agent => (
          <AgentNode
            key={agent.id}
            agent={agent}
            intensity={params.intensity}
            speed={params.speed}
            paused={paused}
            isSelected={selectedId === agent.id}
            onSelect={handleSelect}
          />
        ))}

        {/* Controles de órbita */}
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={4}
          maxDistance={12}
          autoRotate={false}
        />

        {/* Post-processing */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            height={300}
            intensity={params.bloom}
          />
          <Vignette eskil={false} offset={0.1} darkness={0.8} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
