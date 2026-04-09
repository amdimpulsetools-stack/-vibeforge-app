"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Zap, LogOut, ChevronDown, Search, Check } from "lucide-react";

const COUNTRIES = [
  { code: "PE", dial: "+51", flag: "🇵🇪", name: "Perú" },
  { code: "MX", dial: "+52", flag: "🇲🇽", name: "México" },
  { code: "CO", dial: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "AR", dial: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "CL", dial: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "EC", dial: "+593", flag: "🇪🇨", name: "Ecuador" },
  { code: "BO", dial: "+591", flag: "🇧🇴", name: "Bolivia" },
  { code: "PY", dial: "+595", flag: "🇵🇾", name: "Paraguay" },
  { code: "UY", dial: "+598", flag: "🇺🇾", name: "Uruguay" },
  { code: "VE", dial: "+58", flag: "🇻🇪", name: "Venezuela" },
  { code: "BR", dial: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "ES", dial: "+34", flag: "🇪🇸", name: "España" },
];

interface Specialty {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export default function OnboardingPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(null);
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [specialtyDropdownOpen, setSpecialtyDropdownOpen] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const specialtyDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (specialtyDropdownRef.current && !specialtyDropdownRef.current.contains(e.target as Node)) {
        setSpecialtyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch specialties
  useEffect(() => {
    const fetchSpecialties = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("specialties")
        .select("id, name, slug, description")
        .eq("is_active", true)
        .order("sort_order");
      if (data) setSpecialties(data);
    };
    fetchSpecialties();
  }, []);

  const filteredSpecialties = useMemo(() => {
    if (!specialtySearch.trim()) return specialties;
    const term = specialtySearch.toLowerCase();
    return specialties.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.description?.toLowerCase().includes(term)
    );
  }, [specialties, specialtySearch]);

  // Check auth and pre-fill name if available
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/register");
        return;
      }

      setUserEmail(user.email ?? null);

      // Pre-fill name from user metadata if available
      const metaName = user.user_metadata?.full_name;
      if (metaName) setFullName(metaName);

      // Check if already onboarded (has phone number)
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("whatsapp_phone")
        .eq("id", user.id)
        .single();

      if (profile?.whatsapp_phone) {
        router.push("/select-plan");
        return;
      }

      setCheckingAuth(false);
    };
    init();
  }, [router]);

  const isFormValid = fullName.trim().length > 0 && phone.trim().length >= 6 && selectedSpecialty !== null;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/register");
      return;
    }

    const fullPhone = `${country.dial}${phone.replace(/\D/g, "")}`;

    // Update user profile
    const { error } = await supabase
      .from("user_profiles")
      .update({
        full_name: fullName.trim(),
        whatsapp_phone: fullPhone,
      })
      .eq("id", user.id);

    if (error) {
      toast.error("Error al guardar tu información");
      setLoading(false);
      return;
    }

    // Also update auth metadata
    await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });

    // Save specialty to organization
    if (selectedSpecialty) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        // Set primary specialty
        await supabase
          .from("organizations")
          .update({ primary_specialty_id: selectedSpecialty.id })
          .eq("id", membership.organization_id);

        // Link in organization_specialties
        await supabase
          .from("organization_specialties")
          .upsert({
            organization_id: membership.organization_id,
            specialty_id: selectedSpecialty.id,
          }, { onConflict: "organization_id,specialty_id" });
      }
    }

    router.push("/select-plan");
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/register");
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg gradient-glow">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary mb-4">
            Inicia prueba de 14 días
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Personaliza tu cuenta
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
            Ingresa tu información personal para recibir noticias y
            actualizaciones importantes sobre {APP_NAME}
          </p>
        </div>

        {/* Form */}
        <div className="glass-card rounded-2xl p-7 shadow-xl space-y-5">
          {/* Full name */}
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-sm font-semibold">
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="Juan Pérez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
            />
          </div>

          {/* Specialty search select */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">
              Especialidad principal
            </label>
            <div className="relative" ref={specialtyDropdownRef}>
              <button
                type="button"
                onClick={() => setSpecialtyDropdownOpen(!specialtyDropdownOpen)}
                className={`flex h-11 w-full items-center justify-between rounded-xl border bg-background/50 px-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring/50 ${
                  selectedSpecialty
                    ? "border-primary/50 text-foreground"
                    : "border-input text-muted-foreground/60"
                }`}
              >
                <span>{selectedSpecialty?.name || "Selecciona tu especialidad"}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${specialtyDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {specialtyDropdownOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                  {/* Search input */}
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={specialtySearch}
                      onChange={(e) => setSpecialtySearch(e.target.value)}
                      placeholder="Buscar especialidad..."
                      className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  {/* Options list */}
                  <div className="max-h-52 overflow-y-auto py-1">
                    {filteredSpecialties.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No se encontraron resultados</p>
                    ) : (
                      filteredSpecialties.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedSpecialty(s);
                            setSpecialtyDropdownOpen(false);
                            setSpecialtySearch("");
                          }}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 ${
                            selectedSpecialty?.id === s.id ? "bg-primary/10 text-primary" : ""
                          }`}
                        >
                          <div className="flex-1 text-left">
                            <p className="font-medium">{s.name}</p>
                            {s.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                            )}
                          </div>
                          {selectedSpecialty?.id === s.id && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp phone with country selector */}
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-sm font-semibold">
              Número de WhatsApp personal
            </label>
            <div className="flex gap-2">
              {/* Country selector */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex h-11 items-center gap-1.5 rounded-xl border border-input bg-background/50 px-3 text-sm transition-all hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <span className="text-lg leading-none">{country.flag}</span>
                  <span className="text-muted-foreground">{country.dial}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>

                {dropdownOpen && (
                  <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                    <div className="max-h-60 overflow-y-auto py-1">
                      {COUNTRIES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setCountry(c);
                            setDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/50 ${
                            c.code === country.code
                              ? "bg-primary/10 text-primary"
                              : ""
                          }`}
                        >
                          <span className="text-lg leading-none">{c.flag}</span>
                          <span className="flex-1 text-left">{c.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {c.dial}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Phone input */}
              <input
                id="phone"
                type="tel"
                placeholder="987 654 321"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d\s-]/g, "");
                  setPhone(val);
                }}
                className="flex h-11 flex-1 rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !isFormValid}
            className={`flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold shadow-md transition-all disabled:opacity-50 ${
              isFormValid
                ? "gradient-primary text-white hover:opacity-90 hover:shadow-lg"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isFormValid
              ? "Ir a mi panel"
              : "Rellene ambos campos para continuar"}
          </button>
        </div>

        {/* Logged-in footer */}
        {userEmail && (
          <div className="text-center text-sm text-muted-foreground">
            Ingresaste como{" "}
            <span className="font-medium text-foreground">{userEmail}</span>
            <br />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 mt-1 text-primary hover:underline text-sm"
            >
              ¿No eres tú?
              <LogOut className="h-3 w-3" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
