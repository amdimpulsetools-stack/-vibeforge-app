// SUNAT / INEI ubigeo catalog (partial).
//
// Format: 6 digits = DD (departamento) + PP (provincia) + DD (distrito).
// Source: codigos publicados por INEI / SUNAT, conocidos al 2025.
//
// Cobertura actual: Lima Metropolitana + Callao completos, y la capital
// (cercado de la provincia capital) de cada uno de los 24 departamentos.
// Eso es suficiente para el piloto: la mayoría de clínicas tempranas
// están en Lima/Callao y el resto puede ingresar su capital regional.
//
// TODO: catalog completo INEI 2026 (~1900 entries) — load on demand,
// idealmente desde una tabla de DB indexada o desde un JSON estático
// servido por la app cuando el usuario abra el combobox.

export interface UbigeoOption {
  code: string; // 6 digits
  departamento: string;
  provincia: string;
  distrito: string;
  /** Pre-formatted "Distrito, Provincia, Departamento" for display + search. */
  label: string;
}

function entry(
  code: string,
  departamento: string,
  provincia: string,
  distrito: string
): UbigeoOption {
  return {
    code,
    departamento,
    provincia,
    distrito,
    label: `${distrito}, ${provincia}, ${departamento}`,
  };
}

// ─── Lima Metropolitana (provincia 01 del depto 15) ──────────────────
// Los 43 distritos de la provincia de Lima. Cercado de Lima = 150101.
const LIMA_METRO: UbigeoOption[] = [
  entry("150101", "Lima", "Lima", "Lima (Cercado)"),
  entry("150102", "Lima", "Lima", "Ancón"),
  entry("150103", "Lima", "Lima", "Ate"),
  entry("150104", "Lima", "Lima", "Barranco"),
  entry("150105", "Lima", "Lima", "Breña"),
  entry("150106", "Lima", "Lima", "Carabayllo"),
  entry("150107", "Lima", "Lima", "Chaclacayo"),
  entry("150108", "Lima", "Lima", "Chorrillos"),
  entry("150109", "Lima", "Lima", "Cieneguilla"),
  entry("150110", "Lima", "Lima", "Comas"),
  entry("150111", "Lima", "Lima", "El Agustino"),
  entry("150112", "Lima", "Lima", "Independencia"),
  entry("150113", "Lima", "Lima", "Jesús María"),
  entry("150114", "Lima", "Lima", "La Molina"),
  entry("150115", "Lima", "Lima", "La Victoria"),
  entry("150116", "Lima", "Lima", "Lince"),
  entry("150117", "Lima", "Lima", "Los Olivos"),
  entry("150118", "Lima", "Lima", "Lurigancho (Chosica)"),
  entry("150119", "Lima", "Lima", "Lurín"),
  entry("150120", "Lima", "Lima", "Magdalena del Mar"),
  entry("150121", "Lima", "Lima", "Pueblo Libre"),
  entry("150122", "Lima", "Lima", "Miraflores"),
  entry("150123", "Lima", "Lima", "Pachacámac"),
  entry("150124", "Lima", "Lima", "Pucusana"),
  entry("150125", "Lima", "Lima", "Puente Piedra"),
  entry("150126", "Lima", "Lima", "Punta Hermosa"),
  entry("150127", "Lima", "Lima", "Punta Negra"),
  entry("150128", "Lima", "Lima", "Rímac"),
  entry("150129", "Lima", "Lima", "San Bartolo"),
  entry("150130", "Lima", "Lima", "San Borja"),
  entry("150131", "Lima", "Lima", "San Isidro"),
  entry("150132", "Lima", "Lima", "San Juan de Lurigancho"),
  entry("150133", "Lima", "Lima", "San Juan de Miraflores"),
  entry("150134", "Lima", "Lima", "San Luis"),
  entry("150135", "Lima", "Lima", "San Martín de Porres"),
  entry("150136", "Lima", "Lima", "San Miguel"),
  entry("150137", "Lima", "Lima", "Santa Anita"),
  entry("150138", "Lima", "Lima", "Santa María del Mar"),
  entry("150139", "Lima", "Lima", "Santa Rosa"),
  entry("150140", "Lima", "Lima", "Santiago de Surco"),
  entry("150141", "Lima", "Lima", "Surquillo"),
  entry("150142", "Lima", "Lima", "Villa El Salvador"),
  entry("150143", "Lima", "Lima", "Villa María del Triunfo"),
];

// ─── Callao (provincia constitucional 01 del depto 07) ───────────────
const CALLAO: UbigeoOption[] = [
  entry("070101", "Callao", "Callao", "Callao (Cercado)"),
  entry("070102", "Callao", "Callao", "Bellavista"),
  entry("070103", "Callao", "Callao", "Carmen de la Legua-Reynoso"),
  entry("070104", "Callao", "Callao", "La Perla"),
  entry("070105", "Callao", "Callao", "La Punta"),
  entry("070106", "Callao", "Callao", "Ventanilla"),
  entry("070107", "Callao", "Callao", "Mi Perú"),
];

// ─── Capitales de departamento (cercado de la provincia capital) ─────
// Sólo se incluye la capital regional. Los códigos siguen el patrón
// DD0101 donde DD es el código del departamento. El nombre del distrito
// es el cercado de la ciudad capital.
const CAPITALES_DEPARTAMENTO: UbigeoOption[] = [
  entry("010101", "Amazonas", "Chachapoyas", "Chachapoyas"),
  entry("020101", "Áncash", "Huaraz", "Huaraz"),
  entry("030101", "Apurímac", "Abancay", "Abancay"),
  entry("040101", "Arequipa", "Arequipa", "Arequipa"),
  entry("050101", "Ayacucho", "Huamanga", "Ayacucho"),
  entry("060101", "Cajamarca", "Cajamarca", "Cajamarca"),
  entry("080101", "Cusco", "Cusco", "Cusco"),
  entry("090101", "Huancavelica", "Huancavelica", "Huancavelica"),
  entry("100101", "Huánuco", "Huánuco", "Huánuco"),
  entry("110101", "Ica", "Ica", "Ica"),
  entry("120101", "Junín", "Huancayo", "Huancayo"),
  entry("130101", "La Libertad", "Trujillo", "Trujillo"),
  entry("140101", "Lambayeque", "Chiclayo", "Chiclayo"),
  entry("160101", "Loreto", "Maynas", "Iquitos"),
  entry("170101", "Madre de Dios", "Tambopata", "Puerto Maldonado"),
  entry("180101", "Moquegua", "Mariscal Nieto", "Moquegua"),
  entry("190101", "Pasco", "Pasco", "Chaupimarca"),
  entry("200101", "Piura", "Piura", "Piura"),
  entry("210101", "Puno", "Puno", "Puno"),
  entry("220101", "San Martín", "Moyobamba", "Moyobamba"),
  entry("230101", "Tacna", "Tacna", "Tacna"),
  entry("240101", "Tumbes", "Tumbes", "Tumbes"),
  entry("250101", "Ucayali", "Coronel Portillo", "Callería (Pucallpa)"),
];

// Lima como departamento (no metropolitana): se mantiene la entrada del
// cercado dentro del bloque LIMA_METRO (150101). No se duplica aquí.

export const UBIGEO_OPTIONS: UbigeoOption[] = [
  ...LIMA_METRO,
  ...CALLAO,
  ...CAPITALES_DEPARTAMENTO,
];

/** Quick lookup by 6-digit code. Returns undefined if not in the catalog. */
export function findUbigeoByCode(code: string | null | undefined): UbigeoOption | undefined {
  if (!code) return undefined;
  return UBIGEO_OPTIONS.find((u) => u.code === code);
}

/** Case-insensitive substring search across label + code. */
export function searchUbigeo(query: string, limit = 50): UbigeoOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return UBIGEO_OPTIONS.slice(0, limit);
  const matches: UbigeoOption[] = [];
  for (const u of UBIGEO_OPTIONS) {
    if (
      u.code.includes(q) ||
      u.label.toLowerCase().includes(q) ||
      u.distrito.toLowerCase().includes(q) ||
      u.provincia.toLowerCase().includes(q) ||
      u.departamento.toLowerCase().includes(q)
    ) {
      matches.push(u);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
