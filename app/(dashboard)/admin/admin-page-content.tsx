"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import {
  Building2,
  Stethoscope,
  ClipboardList,
  ListOrdered,
  UsersRound,
  FlaskConical,
  BookOpen,
  Tag,
  ArrowRight,
} from "lucide-react";

interface AdminPageContentProps {
  officeCount: number;
  doctorCount: number;
  serviceCount: number;
  lookupCount: number;
  memberCount: number;
  examCount?: number;
  diagnosisCodesCount?: number;
}

export function AdminPageContent({
  officeCount,
  doctorCount,
  serviceCount,
  lookupCount,
  memberCount,
  examCount = 0,
  diagnosisCodesCount = 0,
}: AdminPageContentProps) {
  const { t } = useLanguage();

  const cards = [
    {
      title: t("admin.offices_card"),
      desc: t("admin.offices_desc"),
      href: "/admin/offices",
      icon: Building2,
      count: officeCount,
    },
    {
      title: t("admin.doctors_card"),
      desc: t("admin.doctors_desc"),
      href: "/admin/doctors",
      icon: Stethoscope,
      count: doctorCount,
    },
    {
      title: t("admin.services_card"),
      desc: t("admin.services_desc"),
      href: "/admin/services",
      icon: ClipboardList,
      count: serviceCount,
    },
    {
      title: t("admin.lookups_card"),
      desc: t("admin.lookups_desc"),
      href: "/admin/lookups",
      icon: ListOrdered,
      count: lookupCount,
    },
    {
      title: t("admin.members_card"),
      desc: t("admin.members_desc"),
      href: "/admin/members",
      icon: UsersRound,
      count: memberCount,
    },
    {
      title: "Catálogo de Exámenes",
      desc: "Configura los exámenes disponibles para solicitar",
      href: "/admin/exam-catalog",
      icon: FlaskConical,
      count: examCount,
    },
    {
      title: "Diagnósticos CIE-10",
      desc: "Extiende el catálogo con códigos de tu especialidad",
      href: "/admin/diagnosis-codes",
      icon: BookOpen,
      count: diagnosisCodesCount,
    },
    {
      title: "Códigos de descuento",
      desc: "Crea cupones reutilizables para aplicar en recepción (Pro)",
      href: "/admin/discount-codes",
      icon: Tag,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-primary/5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="h-6 w-6" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </div>
            <div className="mt-4">
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
            </div>
            <div className="mt-4">
              {card.count != null ? (
                <span className="text-2xl font-bold text-primary">{card.count}</span>
              ) : (
                <span className="text-2xl font-bold text-primary/60">—</span>
              )}
              <span className="ml-2 text-sm text-muted-foreground">registros</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
