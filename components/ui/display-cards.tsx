"use client";

import { cn } from "@/lib/utils";
import {
  CalendarPlus,
  UserCheck,
  CalendarClock,
  Bell,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

interface DisplayCardProps {
  className?: string;
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  date?: string;
  iconClassName?: string;
  titleClassName?: string;
}

function DisplayCard({
  className,
  icon = <Bell className="size-4 text-emerald-300" />,
  title = "Notificación",
  description = "Nueva actividad en tu clínica",
  date = "Ahora",
  iconClassName = "text-emerald-500",
  titleClassName = "text-emerald-600",
}: DisplayCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-36 w-[22rem] -skew-y-[8deg] select-none flex-col justify-between rounded-xl border-2 border-slate-200/80 bg-white/80 backdrop-blur-sm px-4 py-3 transition-all duration-700 after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-[20rem] after:bg-gradient-to-l after:from-white after:to-transparent after:content-[''] hover:border-emerald-300 hover:bg-white hover:shadow-lg hover:shadow-emerald-100/50 [&>*]:flex [&>*]:items-center [&>*]:gap-2",
        className
      )}
    >
      <div>
        <span className="relative inline-block rounded-full bg-emerald-100 p-1.5">
          {icon}
        </span>
        <p className={cn("text-sm font-semibold", titleClassName)}>{title}</p>
      </div>
      <p className="whitespace-nowrap text-base text-slate-700">{description}</p>
      <p className="text-xs text-slate-400">{date}</p>
    </div>
  );
}

interface DisplayCardsProps {
  cards?: DisplayCardProps[];
}

export default function DisplayCards({ cards }: DisplayCardsProps) {
  const defaultCards: DisplayCardProps[] = [
    {
      icon: <CalendarPlus className="size-4 text-emerald-500" />,
      title: "Nueva cita",
      description: "María García — Control general",
      date: "Hace 2 min",
      titleClassName: "text-emerald-600",
      className:
        "[grid-area:stack] hover:-translate-y-10 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-slate-200 before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-white/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
    },
    {
      icon: <CalendarClock className="size-4 text-amber-500" />,
      title: "Reprogramada",
      description: "Carlos López — Ecografía",
      date: "Hace 15 min",
      titleClassName: "text-amber-600",
      className:
        "[grid-area:stack] translate-x-16 translate-y-10 hover:-translate-y-1 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-slate-200 before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-white/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
    },
    {
      icon: <CreditCard className="size-4 text-blue-500" />,
      title: "Pago registrado",
      description: "Ana Rodríguez — S/. 150.00",
      date: "Hace 30 min",
      titleClassName: "text-blue-600",
      className:
        "[grid-area:stack] translate-x-32 translate-y-20 hover:translate-y-10",
    },
  ];

  const displayCards = cards || defaultCards;

  return (
    <div className="grid [grid-template-areas:'stack'] place-items-center opacity-100 animate-in fade-in-0 duration-700">
      {displayCards.map((cardProps, index) => (
        <DisplayCard key={index} {...cardProps} />
      ))}
    </div>
  );
}

export { DisplayCard };
export type { DisplayCardProps, DisplayCardsProps };
