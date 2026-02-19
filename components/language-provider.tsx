"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Language = "es" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  es: {
    // Sidebar
    "nav.dashboard": "Dashboard",
    "nav.account": "Cuenta",
    "nav.settings": "Configuración",
    "nav.logout": "Cerrar sesión",
    "nav.logout_success": "Sesión cerrada",

    // Account page
    "account.title": "Mi cuenta",
    "account.subtitle": "Administra tu información personal",
    "account.personal_data": "Datos personales",
    "account.full_name": "Nombre completo",
    "account.full_name_placeholder": "Tu nombre",
    "account.phone": "Celular",
    "account.phone_placeholder": "+57 300 000 0000",
    "account.save": "Guardar cambios",
    "account.saving": "Guardando...",
    "account.save_success": "Perfil actualizado correctamente",
    "account.save_error": "Error al guardar los cambios",
    "account.danger_zone": "Zona de peligro",
    "account.danger_description": "Acciones irreversibles sobre tu cuenta.",
    "account.delete_account": "Eliminar cuenta",

    // Settings page
    "settings.title": "Configuración",
    "settings.subtitle": "Personaliza la aplicación a tu gusto",
    "settings.appearance": "Apariencia",
    "settings.appearance_description": "Elige el tema visual de la aplicación",
    "settings.theme_dark": "Oscuro",
    "settings.theme_dark_description": "Ideal para ambientes con poca luz",
    "settings.theme_light": "Claro",
    "settings.theme_light_description": "Ideal para ambientes iluminados",
    "settings.language": "Idioma",
    "settings.language_description": "Selecciona el idioma de la interfaz",
    "settings.lang_es": "Español",
    "settings.lang_es_description": "Interfaz en español",
    "settings.lang_en": "English",
    "settings.lang_en_description": "Interface in English",

    // Validation
    "validation.name_min": "El nombre debe tener al menos 2 caracteres",
    "validation.name_max": "El nombre no puede superar 100 caracteres",
    "validation.phone_max": "El celular no puede superar 20 caracteres",

    // Dashboard
    "dashboard.welcome": "Bienvenido de vuelta",
    "dashboard.stats": "Estadísticas",
  },
  en: {
    // Sidebar
    "nav.dashboard": "Dashboard",
    "nav.account": "Account",
    "nav.settings": "Settings",
    "nav.logout": "Log out",
    "nav.logout_success": "Logged out",

    // Account page
    "account.title": "My Account",
    "account.subtitle": "Manage your personal information",
    "account.personal_data": "Personal data",
    "account.full_name": "Full name",
    "account.full_name_placeholder": "Your name",
    "account.phone": "Phone",
    "account.phone_placeholder": "+1 555 000 0000",
    "account.save": "Save changes",
    "account.saving": "Saving...",
    "account.save_success": "Profile updated successfully",
    "account.save_error": "Error saving changes",
    "account.danger_zone": "Danger zone",
    "account.danger_description": "Irreversible actions on your account.",
    "account.delete_account": "Delete account",

    // Settings page
    "settings.title": "Settings",
    "settings.subtitle": "Customize the app to your liking",
    "settings.appearance": "Appearance",
    "settings.appearance_description": "Choose the visual theme of the app",
    "settings.theme_dark": "Dark",
    "settings.theme_dark_description": "Ideal for low-light environments",
    "settings.theme_light": "Light",
    "settings.theme_light_description": "Ideal for bright environments",
    "settings.language": "Language",
    "settings.language_description": "Select the interface language",
    "settings.lang_es": "Español",
    "settings.lang_es_description": "Interfaz en español",
    "settings.lang_en": "English",
    "settings.lang_en_description": "Interface in English",

    // Validation
    "validation.name_min": "Name must be at least 2 characters",
    "validation.name_max": "Name cannot exceed 100 characters",
    "validation.phone_max": "Phone cannot exceed 20 characters",

    // Dashboard
    "dashboard.welcome": "Welcome back",
    "dashboard.stats": "Statistics",
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: "es",
  setLanguage: () => {},
  t: (key: string) => key,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("es");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage?.getItem("vibeforge-language") as Language;
    if (saved === "es" || saved === "en") {
      setLanguageState(saved);
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      window.localStorage.setItem("vibeforge-language", lang);
    } catch {}
  };

  const t = (key: string): string => {
    return translations[language]?.[key] ?? key;
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
