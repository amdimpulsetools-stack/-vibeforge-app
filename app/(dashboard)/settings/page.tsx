"use client";

import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { Sun, Moon, Globe } from "lucide-react";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Idioma */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{t("settings.language")}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t("settings.language_description")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setLanguage("es")}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                language === "es"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${
                  language === "es"
                    ? "bg-primary/20"
                    : "bg-muted"
                }`}
              >
                🇪🇸
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{t("settings.lang_es")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.lang_es_description")}
                </p>
              </div>
            </button>

            <button
              onClick={() => setLanguage("en")}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                language === "en"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${
                  language === "en"
                    ? "bg-primary/20"
                    : "bg-muted"
                }`}
              >
                🇺🇸
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{t("settings.lang_en")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.lang_en_description")}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Apariencia */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-2">{t("settings.appearance")}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("settings.appearance_description")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => theme === "light" && toggleTheme()}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  theme === "dark"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Moon className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{t("settings.theme_dark")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.theme_dark_description")}
                </p>
              </div>
            </button>

            <button
              onClick={() => theme === "dark" && toggleTheme()}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  theme === "light"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Sun className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{t("settings.theme_light")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.theme_light_description")}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
