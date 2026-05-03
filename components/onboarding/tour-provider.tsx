"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import "driver.js/dist/driver.css";

const STORAGE_KEY = "yenda_tour_completed_v1";
const MOBILE_BREAKPOINT = 768;

interface TourContextValue {
  startTour: () => Promise<void>;
  resetTour: () => void;
  tourCompleted: boolean;
}

const TourContext = createContext<TourContextValue>({
  startTour: async () => {},
  resetTour: () => {},
  tourCompleted: false,
});

interface TourStep {
  selector: string;
  title: string;
  body: string;
  side: "top" | "right" | "bottom" | "left" | "over";
  align: "start" | "center" | "end";
  highlight: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: "body",
    title: "Bienvenido a Yenda",
    body: "Te guiamos en 10 pasos por las funciones principales. Puedes omitir el tour en cualquier momento. ¿Empezamos?",
    side: "over",
    align: "center",
    highlight: false,
  },
  {
    selector: '[data-tour-step="sidebar"]',
    title: "Tu menú principal",
    body: "Desde acá accedes a todas las secciones de tu clínica: agenda, pacientes, reportes, facturación y configuración.",
    side: "right",
    align: "center",
    highlight: true,
  },
  {
    selector: '[data-tour-step="nav-dashboard"]',
    title: "Escritorio",
    body: "Tu vista general: ingresos del mes, citas, ocupación y pacientes nuevos. Acá llegás cuando entras a Yenda.",
    side: "right",
    align: "center",
    highlight: true,
  },
  {
    selector: '[data-tour-step="nav-scheduler"]',
    title: "Agenda",
    body: "El corazón del producto. Crea citas, bloquea horarios, configura tu break time y comparte horarios disponibles por WhatsApp.",
    side: "right",
    align: "center",
    highlight: true,
  },
  {
    selector: '[data-tour-step="nav-patients"]',
    title: "Pacientes",
    body: "Ficha clínica completa de cada paciente: historial, presupuestos, pagos, consentimientos y más.",
    side: "right",
    align: "center",
    highlight: true,
  },
  {
    selector: '[data-tour-step="nav-reports"]',
    title: "Reportes",
    body: "Métricas financieras y operacionales con exportación a CSV. Incluye reporte IA con insights automáticos.",
    side: "right",
    align: "center",
    highlight: true,
  },
  {
    selector: '[data-tour-step="nav-settings"]',
    title: "Configuración",
    body: "Acá personalizas tu clínica: agenda, equipo, plantillas, módulos verticales por especialidad (fertilidad, dermatología, etc.) y más.",
    side: "right",
    align: "center",
    highlight: true,
  },
  {
    selector: '[data-tour-step="topbar-user"]',
    title: "Tu cuenta",
    body: "Tu perfil, plan, facturación y opciones de cuenta. Para cerrar sesión también es por acá.",
    side: "bottom",
    align: "end",
    highlight: true,
  },
  {
    selector: '[data-tour-step="topbar-notifications"]',
    title: "Notificaciones",
    body: "Te avisaremos cuando llegue una nueva cita, pago, mensaje o recordatorio importante.",
    side: "bottom",
    align: "center",
    highlight: true,
  },
  {
    selector: "body",
    title: "Listo, ya tienes lo básico",
    body: "Tu próximo paso: crear tus servicios y agendar tu primera cita. Cualquier duda, escríbenos a soporte@yenda.app.",
    side: "over",
    align: "center",
    highlight: false,
  },
];

function readStoredCompletion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredCompletion(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore quota or privacy-mode errors
  }
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [tourCompleted, setTourCompleted] = useState<boolean>(false);
  const driverInstanceRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    setTourCompleted(readStoredCompletion());
  }, []);

  const startTour = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      toast.info(
        "El tour está optimizado para desktop. Por favor abre Yenda en una computadora para verlo."
      );
      return;
    }

    const { driver } = await import("driver.js");

    if (driverInstanceRef.current) {
      driverInstanceRef.current.destroy();
      driverInstanceRef.current = null;
    }

    const handleComplete = () => {
      writeStoredCompletion(true);
      setTourCompleted(true);
    };

    const instance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: "#070e1b",
      overlayOpacity: 0.75,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: "yenda-tour-popover",
      progressText: "{{current}} de {{total}}",
      nextBtnText: "Siguiente",
      prevBtnText: "Atrás",
      doneBtnText: "Empezar a usar Yenda",
      onDestroyed: () => {
        handleComplete();
      },
      steps: TOUR_STEPS.map((step, index) => {
        const isFirst = index === 0;
        const isLast = index === TOUR_STEPS.length - 1;
        return {
          element: step.highlight ? step.selector : undefined,
          disableActiveInteraction: true,
          popover: {
            title: step.title,
            description: step.body,
            side: step.side,
            align: step.align,
            showButtons: isFirst
              ? ["next", "close"]
              : isLast
                ? ["previous", "next"]
                : ["next", "previous", "close"],
          },
        };
      }),
    });

    driverInstanceRef.current = instance;
    instance.drive();
  }, []);

  const resetTour = useCallback(() => {
    writeStoredCompletion(false);
    setTourCompleted(false);
  }, []);

  useEffect(() => {
    return () => {
      if (driverInstanceRef.current) {
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({ startTour, resetTour, tourCompleted }),
    [startTour, resetTour, tourCompleted]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  return useContext(TourContext);
}
