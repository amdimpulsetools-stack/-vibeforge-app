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
    "nav.admin": "Administración",
    "nav.admin_offices": "Consultorios",
    "nav.admin_doctors": "Doctores",
    "nav.admin_services": "Servicios",
    "nav.admin_lookups": "Variables Globales",

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

    // Admin hub
    "admin.title": "Administración",
    "admin.subtitle": "Configura los parámetros del sistema",
    "admin.offices_card": "Consultorios",
    "admin.offices_desc": "Gestiona los espacios físicos",
    "admin.doctors_card": "Doctores",
    "admin.doctors_desc": "Gestiona el personal médico",
    "admin.services_card": "Catálogo de Servicios",
    "admin.services_desc": "Configura procedimientos y precios",
    "admin.lookups_card": "Variables Globales",
    "admin.lookups_desc": "Listas desplegables del sistema",

    // Offices
    "offices.title": "Consultorios",
    "offices.subtitle": "Gestiona los consultorios disponibles",
    "offices.name": "Nombre",
    "offices.description": "Descripción",
    "offices.active": "Activo",
    "offices.save_success": "Consultorio guardado",
    "offices.save_error": "Error al guardar el consultorio",
    "offices.add": "Agregar Consultorio",
    "offices.delete_confirm": "¿Eliminar este consultorio?",
    "offices.delete_success": "Consultorio eliminado",
    "offices.no_offices": "No hay consultorios registrados",

    // Doctors
    "doctors.title": "Doctores",
    "doctors.subtitle": "Gestiona el equipo médico",
    "doctors.add": "Agregar Doctor",
    "doctors.name": "Nombre completo",
    "doctors.cmp": "CMP (N° de colegiatura)",
    "doctors.photo": "Foto",
    "doctors.color": "Color identificador",
    "doctors.status": "Estado",
    "doctors.active": "Activo",
    "doctors.inactive": "Inactivo",
    "doctors.services_tab": "Servicios",
    "doctors.schedule_tab": "Horario",
    "doctors.profile_tab": "Perfil",
    "doctors.service_matrix": "Matriz de Servicios",
    "doctors.service_matrix_desc": "Selecciona los procedimientos que realiza este doctor",
    "doctors.schedule_title": "Horario Semanal",
    "doctors.schedule_desc": "Define la disponibilidad semanal del doctor",
    "doctors.save_success": "Doctor guardado correctamente",
    "doctors.save_error": "Error al guardar el doctor",
    "doctors.delete_confirm": "¿Eliminar este doctor?",
    "doctors.delete_success": "Doctor eliminado",
    "doctors.no_doctors": "No hay doctores registrados",
    "doctors.edit": "Editar Doctor",

    // Services
    "services.title": "Catálogo de Servicios",
    "services.subtitle": "Configura los procedimientos disponibles",
    "services.add": "Agregar Servicio",
    "services.name": "Nombre del servicio",
    "services.category": "Categoría",
    "services.base_price": "Precio base",
    "services.duration": "Duración (min)",
    "services.active": "Activo",
    "services.save_success": "Servicio guardado correctamente",
    "services.save_error": "Error al guardar el servicio",
    "services.delete_confirm": "¿Eliminar este servicio?",
    "services.delete_success": "Servicio eliminado",
    "services.no_services": "No hay servicios registrados",
    "services.categories": "Categorías",
    "services.add_category": "Agregar Categoría",
    "services.category_name": "Nombre de categoría",
    "services.category_save_success": "Categoría guardada",
    "services.category_delete_success": "Categoría eliminada",
    "services.category_delete_confirm": "¿Eliminar esta categoría?",

    // Lookups
    "lookups.title": "Variables Globales",
    "lookups.subtitle": "Administra las listas desplegables del sistema",
    "lookups.tab_origins": "Orígenes",
    "lookups.tab_payment_methods": "Métodos de Pago",
    "lookups.tab_appointment_status": "Estados de Cita",
    "lookups.tab_responsible": "Responsables",
    "lookups.add_value": "Agregar",
    "lookups.label": "Etiqueta",
    "lookups.value": "Valor",
    "lookups.color": "Color",
    "lookups.order": "Orden",
    "lookups.save_success": "Valor guardado",
    "lookups.save_error": "Error al guardar",
    "lookups.delete_success": "Valor eliminado",
    "lookups.delete_confirm": "¿Eliminar este valor?",

    // Schedule
    "schedule.start_time": "Hora inicio",
    "schedule.end_time": "Hora fin",
    "schedule.office": "Consultorio",
    "schedule.add_block": "Agregar bloque",
    "schedule.remove_block": "Eliminar",

    // Common
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.add": "Agregar",
    "common.search": "Buscar...",
    "common.actions": "Acciones",
    "common.active": "Activo",
    "common.inactive": "Inactivo",
    "common.confirm_delete": "Confirmar eliminación",
    "common.confirm_delete_desc": "Esta acción no se puede deshacer.",
    "common.no_results": "Sin resultados",
    "common.loading": "Cargando...",
    "common.back": "Volver",
    "common.minutes_short": "min",
    "common.currency_symbol": "S/.",
  },
  en: {
    // Sidebar
    "nav.dashboard": "Dashboard",
    "nav.account": "Account",
    "nav.settings": "Settings",
    "nav.logout": "Log out",
    "nav.logout_success": "Logged out",
    "nav.admin": "Administration",
    "nav.admin_offices": "Offices",
    "nav.admin_doctors": "Doctors",
    "nav.admin_services": "Services",
    "nav.admin_lookups": "Global Variables",

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

    // Admin hub
    "admin.title": "Administration",
    "admin.subtitle": "Configure system parameters",
    "admin.offices_card": "Offices",
    "admin.offices_desc": "Manage physical spaces",
    "admin.doctors_card": "Doctors",
    "admin.doctors_desc": "Manage medical staff",
    "admin.services_card": "Service Catalog",
    "admin.services_desc": "Configure procedures and pricing",
    "admin.lookups_card": "Global Variables",
    "admin.lookups_desc": "System dropdown lists",

    // Offices
    "offices.title": "Offices",
    "offices.subtitle": "Manage available offices",
    "offices.name": "Name",
    "offices.description": "Description",
    "offices.active": "Active",
    "offices.save_success": "Office saved",
    "offices.save_error": "Error saving office",
    "offices.add": "Add Office",
    "offices.delete_confirm": "Delete this office?",
    "offices.delete_success": "Office deleted",
    "offices.no_offices": "No offices registered",

    // Doctors
    "doctors.title": "Doctors",
    "doctors.subtitle": "Manage the medical team",
    "doctors.add": "Add Doctor",
    "doctors.name": "Full name",
    "doctors.cmp": "CMP (License number)",
    "doctors.photo": "Photo",
    "doctors.color": "Identifier color",
    "doctors.status": "Status",
    "doctors.active": "Active",
    "doctors.inactive": "Inactive",
    "doctors.services_tab": "Services",
    "doctors.schedule_tab": "Schedule",
    "doctors.profile_tab": "Profile",
    "doctors.service_matrix": "Service Matrix",
    "doctors.service_matrix_desc": "Select procedures this doctor performs",
    "doctors.schedule_title": "Weekly Schedule",
    "doctors.schedule_desc": "Define the doctor's weekly availability",
    "doctors.save_success": "Doctor saved successfully",
    "doctors.save_error": "Error saving doctor",
    "doctors.delete_confirm": "Delete this doctor?",
    "doctors.delete_success": "Doctor deleted",
    "doctors.no_doctors": "No doctors registered",
    "doctors.edit": "Edit Doctor",

    // Services
    "services.title": "Service Catalog",
    "services.subtitle": "Configure available procedures",
    "services.add": "Add Service",
    "services.name": "Service name",
    "services.category": "Category",
    "services.base_price": "Base price",
    "services.duration": "Duration (min)",
    "services.active": "Active",
    "services.save_success": "Service saved successfully",
    "services.save_error": "Error saving service",
    "services.delete_confirm": "Delete this service?",
    "services.delete_success": "Service deleted",
    "services.no_services": "No services registered",
    "services.categories": "Categories",
    "services.add_category": "Add Category",
    "services.category_name": "Category name",
    "services.category_save_success": "Category saved",
    "services.category_delete_success": "Category deleted",
    "services.category_delete_confirm": "Delete this category?",

    // Lookups
    "lookups.title": "Global Variables",
    "lookups.subtitle": "Manage system dropdown lists",
    "lookups.tab_origins": "Origins",
    "lookups.tab_payment_methods": "Payment Methods",
    "lookups.tab_appointment_status": "Appointment Status",
    "lookups.tab_responsible": "Responsible",
    "lookups.add_value": "Add",
    "lookups.label": "Label",
    "lookups.value": "Value",
    "lookups.color": "Color",
    "lookups.order": "Order",
    "lookups.save_success": "Value saved",
    "lookups.save_error": "Error saving",
    "lookups.delete_success": "Value deleted",
    "lookups.delete_confirm": "Delete this value?",

    // Schedule
    "schedule.start_time": "Start time",
    "schedule.end_time": "End time",
    "schedule.office": "Office",
    "schedule.add_block": "Add block",
    "schedule.remove_block": "Remove",

    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.add": "Add",
    "common.search": "Search...",
    "common.actions": "Actions",
    "common.active": "Active",
    "common.inactive": "Inactive",
    "common.confirm_delete": "Confirm deletion",
    "common.confirm_delete_desc": "This action cannot be undone.",
    "common.no_results": "No results",
    "common.loading": "Loading...",
    "common.back": "Back",
    "common.minutes_short": "min",
    "common.currency_symbol": "$",
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
