"use client";

import { useEffect, useSyncExternalStore } from "react";
import { trackLanding } from "@/lib/landing-analytics";
import {
  DEFAULT_LANDING_PROFILE,
  LANDING_PROFILE_CONTENT,
  isLandingProfile,
  type LandingProfile,
  type LandingProfileContent,
} from "./landing-copy";

/**
 * Store mínimo del perfil elegido en el segmentador del hero. Vive fuera de
 * React (módulo) porque tres componentes lejanos entre sí lo leen —hero,
 * pricing y el sticky CTA de móvil— y montar un Context obligaría a envolver
 * la página entera en un provider cliente.
 *
 * Hidratación: el servidor y el primer render del cliente devuelven SIEMPRE
 * `DEFAULT_LANDING_PROFILE` (clínica). El perfil guardado o el de la URL se
 * aplica en un efecto, ya hidratado — así no hay mismatch.
 */

const STORAGE_KEY = "yenda.perfil";

let current: LandingProfile = DEFAULT_LANDING_PROFILE;
let initialized = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): LandingProfile {
  return current;
}

function getServerSnapshot(): LandingProfile {
  return DEFAULT_LANDING_PROFILE;
}

/** Cambia el perfil sin emitir analítica (uso interno: restaurar sesión/URL). */
export function setLandingProfile(profile: LandingProfile) {
  if (current === profile) return;
  current = profile;
  try {
    sessionStorage.setItem(STORAGE_KEY, profile);
  } catch {
    // sessionStorage bloqueado: el perfil vive solo en memoria
  }
  for (const listener of listeners) listener();
}

/** Clic explícito del visitante en el segmentador: cambia + mide. */
export function selectLandingProfile(profile: LandingProfile) {
  const changed = current !== profile;
  setLandingProfile(profile);
  if (changed) trackLanding("perfil_select", { perfil: profile });
}

export function useLandingProfile(): LandingProfile {
  const profile = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  // Una sola vez por carga: la URL manda sobre lo guardado (un link de
  // LinkedIn con ?perfil=doctor tiene que ganarle a la sesión anterior).
  useEffect(() => {
    if (initialized) return;
    initialized = true;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("perfil");
      if (isLandingProfile(fromUrl)) {
        setLandingProfile(fromUrl);
        return;
      }
    } catch {
      // seguimos con sessionStorage
    }
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (isLandingProfile(saved)) setLandingProfile(saved);
    } catch {
      // sin persistencia, sin drama
    }
  }, []);

  return profile;
}

/** Azúcar: perfil + su copy en una sola llamada. */
export function useLandingProfileContent(): {
  profile: LandingProfile;
  content: LandingProfileContent;
} {
  const profile = useLandingProfile();
  return { profile, content: LANDING_PROFILE_CONTENT[profile] };
}
