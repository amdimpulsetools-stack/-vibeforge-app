"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type ArchNodeData,
} from "./architecture-data";

/**
 * NeonNode — nodo del mapa de arquitectura.
 *
 * El brillo NO es decoración: el color dice de qué capa es cada pieza
 * (verde frontend, azul backend, morado integraciones, ámbar datos), así
 * que se lee el mapa por color antes de leer una sola palabra.
 *
 * Al pasar el cursor se despliega el detalle largo (`details`) en un panel
 * flotante. Es un div propio y no un `title` nativo: el del navegador
 * tarda un segundo, no se puede estilar y se corta en textos largos.
 */
export function NeonNode({ data, selected }: NodeProps<Node<ArchNodeData>>) {
  const [hovered, setHovered] = useState(false);
  const color = CATEGORY_COLORS[data.category];
  const isGroup = !!data.isGroup;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Conectores. Sin `isConnectable` porque el mapa es de lectura:
          nadie dibuja aristas a mano sobre la documentación. */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ background: color.base, width: 6, height: 6, border: "none" }}
      />

      <div
        className="rounded-xl border bg-[#0d1117] px-4 py-3 text-left transition-all duration-200"
        style={{
          width: isGroup ? 200 : 180,
          borderColor: color.base,
          // El glow crece con el hover y con la selección: da sensación de
          // profundidad sin animaciones que distraigan.
          boxShadow:
            hovered || selected
              ? `0 0 0 1px rgba(${color.glow}, 0.9), 0 0 22px rgba(${color.glow}, 0.55), 0 0 44px rgba(${color.glow}, 0.25)`
              : `0 0 12px rgba(${color.glow}, 0.28)`,
          transform: hovered ? "translateY(-2px)" : "none",
        }}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: color.base,
              boxShadow: `0 0 8px rgba(${color.glow}, 0.9)`,
            }}
          />
          <span
            className="text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: color.base }}
          >
            {CATEGORY_LABELS[data.category]}
          </span>
        </div>

        <p
          className={`font-bold leading-tight text-slate-100 ${
            isGroup ? "text-[15px]" : "text-[13px]"
          }`}
        >
          {data.title}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
          {data.description}
        </p>

        {/* Pista de la interacción: solo en los nodos que agrupan hijos. */}
        {isGroup && (
          <p className="mt-2 text-[9px] uppercase tracking-wide text-slate-600">
            doble clic para plegar
          </p>
        )}
      </div>

      {/* Tooltip: se monta solo en hover para no tener 30 paneles ocultos
          en el DOM. `pointer-events-none` evita que robe el cursor y haga
          parpadear el hover del propio nodo. */}
      {hovered && data.details && (
        <div
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-3 w-64 -translate-x-1/2 rounded-lg border bg-[#0d1117]/98 px-3 py-2.5 text-[11px] leading-relaxed text-slate-300 backdrop-blur"
          style={{
            borderColor: `rgba(${color.glow}, 0.5)`,
            boxShadow: `0 0 24px rgba(${color.glow}, 0.3), 0 10px 30px rgba(0,0,0,0.6)`,
          }}
        >
          {data.details}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ background: color.base, width: 6, height: 6, border: "none" }}
      />
    </div>
  );
}
